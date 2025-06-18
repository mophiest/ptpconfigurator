import socket
import psutil
import json
import os
import re
import stat
import pwd
import grp
import logging
import subprocess
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Dict, List, Optional, Union
import asyncio
from datetime import datetime

PTP4L_SERVICE_PATH = "/etc/systemd/system/ptp4l.service"
NETWORK_INFO_PATH = "/etc/linuxptp/interfaces.json"
PHC2SYS_SERVICE_PATH = "/etc/systemd/system/phc2sys.service"

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = FastAPI(title="PTP Config API")

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 允许所有来源，生产环境中应该设置具体的域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 挂载静态文件
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    """
    根路径，重定向到前端页面
    """
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/static/index.html")

# 全局状态管理
class ClockSourceState:
    def __init__(self):
        self.current_source: Optional[str] = None
        self.last_update: Optional[datetime] = None
        self.is_failed: bool = False
        self.last_sync_time: Optional[datetime] = None
        self._lock = asyncio.Lock()

    async def update(self, source: str, is_failed: bool = False):
        async with self._lock:
            self.current_source = source
            self.last_update = datetime.now()
            self.is_failed = is_failed
            if not is_failed:
                self.last_sync_time = datetime.now()

    async def get_state(self) -> Dict:
        async with self._lock:
            # 检查是否超时
            if self.last_sync_time:
                time_since_last_sync = (datetime.now() - self.last_sync_time).total_seconds()
                if time_since_last_sync > 3:  # 3秒超时
                    return {
                        "current_source": "noClockAvailable",
                        "last_update": self.last_update.isoformat() if self.last_update else None,
                        "status": "timeout"
                    }

            return {
                "current_source": self.current_source,
                "last_update": self.last_update.isoformat() if self.last_update else None,
                "status": "failed" if self.is_failed else "normal"
            }

# 创建全局状态实例
clock_source_state = ClockSourceState()

def check_phc2sys_service_status() -> bool:
    """检查phc2sys服务是否正在运行"""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", "phc2sys.service"],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0 and result.stdout.strip() == "active"
    except Exception as e:
        logger.error(f"检查phc2sys服务状态失败: {str(e)}")
        return False

def check_service_status(service_name: str) -> bool:
    """检查指定服务是否正在运行"""
    try:
        result = subprocess.run(
            ["systemctl", "is-active", service_name],
            capture_output=True,
            text=True,
            timeout=10
        )
        return result.returncode == 0 and result.stdout.strip() == "active"
    except Exception as e:
        logger.error(f"检查{service_name}服务状态失败: {str(e)}")
        return False

def start_service_if_not_running(service_name: str) -> bool:
    """如果服务未运行则启动服务"""
    try:
        if not check_service_status(service_name):
            logger.info(f"启动{service_name}服务...")
            result = subprocess.run(
                ["systemctl", "start", service_name],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info(f"{service_name}服务启动成功")
                return True
            else:
                logger.error(f"启动{service_name}服务失败: {result.stderr}")
                return False
        else:
            logger.info(f"{service_name}服务已在运行")
            return True
    except Exception as e:
        logger.error(f"启动{service_name}服务时发生异常: {str(e)}")
        return False

def get_current_clock_sync_mode() -> str:
    """
    获取当前主机锁相方式
    
    Returns:
        str: 当前锁相方式 ("internal", "BB", "PTP")
    """
    if check_phc2sys_service_status():
        return "PTP"
    else:
        return "internal"

class ConfigUpdate(BaseModel):
    """
    配置更新请求模型
    """
    key: str
    value: str

class PtpConfigUpdate(BaseModel):
    """
    PTP完整配置更新请求模型
    """
    config_file: str = Field(..., description="配置文件路径")
    domain: Optional[int] = Field(None, description="PTP domain")
    priority1: Optional[int] = Field(None, description="Priority1")
    priority2: Optional[int] = Field(None, description="Priority2")
    logAnnounceInterval: Optional[int] = Field(None, description="Log Announce Interval")
    announceReceiptTimeout: Optional[int] = Field(None, description="Announce Receipt Timeout")
    logSyncInterval: Optional[int] = Field(None, description="Log Sync Interval")
    syncReceiptTimeout: Optional[int] = Field(None, description="Sync Receipt Timeout")
    interfaces: Optional[List[str]] = Field(None, description="网络接口列表")

    class Config:
        json_schema_extra = {
            "example": {
                "config_file": "/etc/linuxptp/ptp4l.conf",
                "domain": 127,
                "priority1": 128,
                "priority2": 128,
                "logAnnounceInterval": 0,
                "announceReceiptTimeout": 6,
                "logSyncInterval": -3,
                "syncReceiptTimeout": 6,
                "interfaces": ["eth0"]
            }
        }

class Ptp4lInterfaceUpdate(BaseModel):
    interfaces: List[str] = Field(..., min_items=1, max_items=2, description="要写入的网卡名，1或2个")
    service_name: str = Field(default="ptp4l.service", description="要修改的service文件名称")

class Phc2sysDomainUpdate(BaseModel):
    domain: int

class PTPStatusRequest(BaseModel):
    domain: int
    uds_path: str

class PHC2SYSConfig(BaseModel):
    domain: int = Field(..., description="PTP domain值", example=127)
    uds_address: str = Field(..., description="UDS地址路径", example="/var/run/ptp4l1")

    class Config:
        json_schema_extra = {
            "example": {
                "domain": 127,
                "uds_address": "/var/run/ptp4l1"
            }
        }

class PHC2SYSParams(BaseModel):
    params: List[PHC2SYSConfig] = Field(..., description="PHC2SYS参数列表，支持多组参数")

    class Config:
        json_schema_extra = {
            "example": {
                "params": [
                    {
                        "domain": 127,
                        "uds_address": "/var/run/ptp4l1"
                    },
                    {
                        "domain": 127,
                        "uds_address": "/var/run/ptp4l"
                    }
                ]
            }
        }

class ServiceAction(BaseModel):
    service_name: str = Field(..., description="要操作的服务名称，如ptp4l.service、phc2sys.service等")

class ClockSourceInfo(BaseModel):
    current_source: Optional[str] = Field(None, description="当前选择的时钟源")
    last_update: Optional[str] = Field(None, description="最后更新时间")

class ClockSyncMode(BaseModel):
    """
    主机锁相方式请求模型
    """
    mode: str = Field(..., description="锁相方式", example="PTP", pattern="^(internal|BB|PTP)$")
    
    class Config:
        json_schema_extra = {
            "example": {
                "mode": "PTP"
            }
        }

def check_file_permissions(file_path):
    """
    检查文件权限
    """
    try:
        st = os.stat(file_path)
        mode = st.st_mode
        uid = st.st_uid
        gid = st.st_gid
        
        # 获取当前用户信息
        current_uid = os.getuid()
        current_gid = os.getgid()
        
        print(f"文件权限: {oct(mode & 0o777)}")
        print(f"文件所有者: {uid} ({pwd.getpwuid(uid).pw_name})")
        print(f"文件组: {gid} ({grp.getgrgid(gid).gr_name})")
        print(f"当前用户: {current_uid} ({pwd.getpwuid(current_uid).pw_name})")
        print(f"当前用户组: {current_gid} ({grp.getgrgid(current_gid).gr_name})")
        
        # 检查当前用户是否有读取权限
        if os.access(file_path, os.R_OK):
            print("当前用户有读取权限")
            return True
        else:
            print("当前用户没有读取权限")
            return False
    except Exception as e:
        print(f"检查权限时出错: {str(e)}")
        return False

def parse_ptp_config(content):
    """
    解析 PTP 配置文件内容，返回键值对
    """
    config_dict = {}
    current_section = None
    
    logger.debug("开始解析配置文件内容")
    logger.debug(f"原始内容长度: {len(content)} 字节")
    
    # 按行分割并处理
    lines = content.split('\n')
    logger.debug(f"总行数: {len(lines)}")
    
    for i, line in enumerate(lines, 1):
        line = line.strip()
        logger.debug(f"处理第 {i} 行: {line}")
        
        # 跳过空行和注释
        if not line or line.startswith('#'):
            logger.debug(f"跳过第 {i} 行 (空行或注释)")
            continue
        
        # 处理节标题
        if line.startswith('[') and line.endswith(']'):
            current_section = line[1:-1]
            config_dict[current_section] = {}
            logger.debug(f"发现节: {current_section}")
            continue
        
        # 处理键值对
        # 使用正则表达式匹配键值对，处理多个空格的情况
        match = re.match(r'^(\S+)\s+(\S.*)$', line)
        if match:
            key = match.group(1).strip()
            value = match.group(2).strip()
            logger.debug(f"解析键值对: key='{key}', value='{value}'")
            
            # 移除值两端的引号
            if (value.startswith('"') and value.endswith('"')) or \
               (value.startswith("'") and value.endswith("'")):
                value = value[1:-1]
                logger.debug(f"移除引号后的值: '{value}'")
            
            if current_section:
                config_dict[current_section][key] = value
                logger.debug(f"在节 {current_section} 中添加: {key}={value}")
            else:
                if 'global' not in config_dict:
                    config_dict['global'] = {}
                config_dict['global'][key] = value
                logger.debug(f"添加全局配置: {key}={value}")
    
    logger.debug("最终解析结果:")
    logger.debug(config_dict)
    return config_dict

def update_config_file(config_path: str, key: str, value: str) -> bool:
    try:
        with open(config_path, 'r') as file:
            lines = file.readlines()

        updated = False
        for i, line in enumerate(lines):
            # 跳过注释和空行
            if not line.strip() or line.strip().startswith('#'):
                continue

            # 用正则定位键和值，保留所有原始空格
            match = re.match(r'^(\s*' + re.escape(key) + r')(\s+)(\S.*)$', line)
            if match:
                # 保留原有的缩进和键-值间空格，只替换值
                lines[i] = f"{match.group(1)}{match.group(2)}{value}\n"
                updated = True
                break

        if not updated:
            logger.error(f"未找到要更新的键: {key}")
            return False

        with open(config_path, 'w') as file:
            file.writelines(lines)

        return True

    except Exception as e:
        logger.error(f"更新配置文件时出错: {str(e)}")
        return False

@app.get("/api/ptp-config")
async def get_ptp_config(config_path: Optional[str] = None):
    """
    读取 PTP 配置文件内容并解析为键值对
    
    Args:
        config_path: 可选的配置文件路径，默认为 /etc/linuxptp/ptp4l.conf
    """
    # 如果没有传入config_path，使用默认路径
    if config_path is None:
        config_path = "/etc/linuxptp/ptp4l.conf"
    
    try:
        logger.info(f"开始处理请求，配置文件路径: {config_path}")
        
        if not os.path.exists(config_path):
            logger.error(f"配置文件不存在: {config_path}")
            raise HTTPException(status_code=404, detail="PTP configuration file not found")
        
        # 检查文件权限
        st = os.stat(config_path)
        logger.info(f"文件权限: {oct(st.st_mode & 0o777)}")
        logger.info(f"文件所有者: {st.st_uid} ({pwd.getpwuid(st.st_uid).pw_name})")
        logger.info(f"文件组: {st.st_gid} ({grp.getgrgid(st.st_gid).gr_name})")
        
        if not os.access(config_path, os.R_OK):
            logger.error("当前用户没有读取权限")
            raise HTTPException(status_code=403, detail="没有权限读取配置文件")
        
        try:
            with open(config_path, 'r') as file:
                content = file.read()
                logger.info(f"成功读取文件，内容长度: {len(content)} 字节")
        except Exception as e:
            logger.error(f"读取文件时出错: {str(e)}")
            raise
        
        if not content:
            logger.warning("配置文件为空")
            return {"success": True, "config": {}}
        
        # 解析配置文件内容
        config_dict = parse_ptp_config(content)
        logger.info("成功解析配置文件")
        
        # 返回与前端期望的格式一致的数据
        return {"success": True, "config": config_dict.get("global", {})}
        
    except PermissionError as e:
        logger.error(f"权限错误: {str(e)}")
        raise HTTPException(status_code=403, detail="没有权限读取配置文件")
    except Exception as e:
        logger.error(f"发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/ptp-config")
async def update_config(update: Union[ConfigUpdate, PtpConfigUpdate], config_path: Optional[str] = None):
    """
    更新配置文件中的指定键值对或完整配置
    
    Args:
        update: 包含要更新的键值对或完整配置
        config_path: 可选的配置文件路径，默认为 /etc/linuxptp/ptp4l.conf
    """
    try:
        # 检查是否是完整配置更新
        if isinstance(update, PtpConfigUpdate):
            # 完整配置更新
            config_file = update.config_file
            logger.info(f"开始完整配置更新，配置文件: {config_file}")
            
            if not os.path.exists(config_file):
                logger.error(f"配置文件不存在: {config_file}")
                raise HTTPException(status_code=404, detail="PTP configuration file not found")
            
            if not os.access(config_file, os.W_OK):
                logger.error("当前用户没有写入权限")
                raise HTTPException(status_code=403, detail="没有权限修改配置文件")
            
            # 读取当前配置
            with open(config_file, 'r') as f:
                content = f.read()
            
            # 解析当前配置
            config_data = parse_ptp_config(content)
            
            # 更新配置项
            updates = []
            if update.domain is not None:
                updates.append(("domainNumber", str(update.domain)))
            if update.priority1 is not None:
                updates.append(("priority1", str(update.priority1)))
            if update.priority2 is not None:
                updates.append(("priority2", str(update.priority2)))
            if update.logAnnounceInterval is not None:
                updates.append(("logAnnounceInterval", str(update.logAnnounceInterval)))
            if update.announceReceiptTimeout is not None:
                updates.append(("announceReceiptTimeout", str(update.announceReceiptTimeout)))
            if update.logSyncInterval is not None:
                updates.append(("logSyncInterval", str(update.logSyncInterval)))
            if update.syncReceiptTimeout is not None:
                updates.append(("syncReceiptTimeout", str(update.syncReceiptTimeout)))
            
            # 应用所有更新
            success = True
            for key, value in updates:
                if not update_config_file(config_file, key, value):
                    success = False
                    break
            
            if success:
                logger.info("完整配置更新成功")
                return {"success": True, "message": "配置已更新", "config_file": config_file}
            else:
                logger.error("完整配置更新失败")
                raise HTTPException(status_code=400, detail="更新配置失败")
                
        else:
            # 单个键值对更新（原有逻辑）
            if config_path is None:
                config_path = "/etc/linuxptp/ptp4l.conf"
                
            key = update.key
            value = update.value
            logger.info(f"开始更新配置，配置文件: {config_path}, 键: {key}, 值: {value}")
            if not os.path.exists(config_path):
                logger.error(f"配置文件不存在: {config_path}")
                raise HTTPException(status_code=404, detail="PTP configuration file not found")
            if not os.access(config_path, os.W_OK):
                logger.error("当前用户没有写入权限")
                raise HTTPException(status_code=403, detail="没有权限修改配置文件")
            if update_config_file(config_path, key, value):
                logger.info("配置更新成功")
                return {"success": True, "message": "配置已更新", "config_path": config_path}
            else:
                logger.error("配置更新失败")
                raise HTTPException(status_code=400, detail="更新配置失败")
                
    except PermissionError as e:
        logger.error(f"权限错误: {str(e)}")
        raise HTTPException(status_code=403, detail="没有权限修改配置文件")
    except Exception as e:
        logger.error(f"发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/ptp4l-service-interface")
async def update_ptp4l_service_interface(update: Ptp4lInterfaceUpdate):
    """
    根据传入网卡名修改指定service文件中的ExecStart行
    """
    try:
        # 构造service文件路径
        service_path = f"/etc/systemd/system/{update.service_name}"
        
        # 检查文件是否存在
        if not os.path.exists(service_path):
            logger.error(f"Service文件不存在: {service_path}")
            raise HTTPException(status_code=404, detail=f"Service文件不存在: {service_path}")
        
        logger.info(f"修改service文件: {service_path}, 网卡: {update.interfaces}")
        
        try:
            with open(service_path, 'r') as f:
                lines = f.readlines()
        except FileNotFoundError:
            logger.error(f"Service文件不存在: {service_path}")
            raise HTTPException(status_code=404, detail=f"Service文件不存在: {service_path}")
        except PermissionError:
            logger.error(f"没有权限读取Service文件: {service_path}")
            raise HTTPException(status_code=403, detail=f"没有权限读取Service文件: {service_path}")
        new_lines = []
        updated = False
        for line in lines:
            if line.strip().startswith("ExecStart="):
                # 保留原有的命令结构，只替换 -i 参数
                # 先去掉所有 -i xxx 参数
                rest = line.split('ExecStart=', 1)[1]
                # 确保ptp4l在开头
                if not rest.strip().startswith('ptp4l'):
                    rest = 'ptp4l ' + rest.lstrip()
                # 去掉所有 -i xxx
                rest = re.sub(r'-i\s+\S+\s*', '', rest)
                # 在ptp4l后面添加新的 -i 参数
                parts = rest.split(maxsplit=1)
                cmd = parts[0]  # 应该是 'ptp4l'
                remaining = parts[1] if len(parts) > 1 else ''
                # 构造新的 -i 参数
                i_args = ' '.join([f'-i {iface}' for iface in update.interfaces])
                # 合成新行，确保顺序是: ptp4l -i xxx [其他参数]
                new_line = f"ExecStart={cmd} {i_args} {remaining}"
                new_lines.append(new_line)
                updated = True
            else:
                new_lines.append(line)
        if not updated:
            logger.error("未找到 ExecStart 行")
            raise HTTPException(status_code=400, detail="未找到 ExecStart 行")
        with open(service_path, 'w') as f:
            f.writelines(new_lines)
        return {"status": "success", "message": "ExecStart已更新", "interfaces": update.interfaces, "service_name": update.service_name}
    except HTTPException:
        # 重新抛出HTTPException，不进行包装
        raise
    except Exception as e:
        logger.error(f"修改{update.service_name}失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"修改{update.service_name}失败")

def get_network_interfaces_info():
    interfaces = []
    stats = psutil.net_if_stats()
    addrs = psutil.net_if_addrs()
    # 兼容 AF_LINK/AF_PACKET
    af_link = getattr(psutil, 'AF_LINK', None) or getattr(socket, 'AF_PACKET', None)
    for name in stats:
        iface = {
            "name": name,
            "is_up": stats[name].isup,
            "mac": None,
            "ip": None
        }
        for addr in addrs.get(name, []):
            if af_link and addr.family == af_link:
                iface["mac"] = addr.address
            elif addr.family == socket.AF_INET:
                iface["ip"] = addr.address
        interfaces.append(iface)
    return interfaces

@app.get("/api/network-interfaces")
async def get_network_interfaces():
    """
    获取本地所有网络接口及状态
    """
    try:
        interfaces = get_network_interfaces_info()
        return {"interfaces": interfaces}
    except Exception as e:
        logger.error(f"获取网络接口信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取网络接口信息失败")

@app.post("/api/network-interfaces/save")
async def save_network_interfaces():
    """
    获取并保存本地所有网络接口及状态到文件
    """
    try:
        interfaces = get_network_interfaces_info()
        with open(NETWORK_INFO_PATH, 'w') as f:
            json.dump(interfaces, f, indent=2, ensure_ascii=False)
        return {"status": "success", "message": "已保存", "file": NETWORK_INFO_PATH}
    except Exception as e:
        logger.error(f"保存网络接口信息失败: {str(e)}")
        raise HTTPException(status_code=500, detail="保存网络接口信息失败")

@app.put("/api/phc2sys/config")
async def update_phc2sys_config(config: PHC2SYSParams):
    """
    更新phc2sys.service配置
    
    - 支持动态替换ExecStart行中的UDS地址(-z)和PTP domain(-n)参数
    - 支持配置多组参数，每组参数包含domain和uds_address
    - 基础参数(-r -m -a)会自动保留在最后
    
    示例：
    ```json
    {
        "params": [
            {
                "domain": 127,
                "uds_address": "/var/run/ptp4l1"
            },
            {
                "domain": 127,
                "uds_address": "/var/run/ptp4l"
            }
        ]
    }
    ```
    """
    try:
        # 读取当前配置
        with open("/etc/systemd/system/phc2sys.service", "r") as f:
            content = f.read()

        # 构建新的ExecStart行
        base_params = "-r -m -a"  # 基础参数
        param_sets = []
        for param in config.params:
            param_sets.append(f"-z {param.uds_address} -n {param.domain}")
        
        new_exec_start = f"ExecStart=phc2sys {' '.join(param_sets)} {base_params}"

        # 替换ExecStart行
        new_content = re.sub(
            r"ExecStart=phc2sys.*",
            new_exec_start,
            content
        )

        # 写入新配置
        with open("/etc/systemd/system/phc2sys.service", "w") as f:
            f.write(new_content)

        # 重新加载systemd配置
        subprocess.run(["systemctl", "daemon-reload"], check=True)

        return {"message": "phc2sys.service配置已更新"}
    except Exception as e:
        logger.error(f"更新phc2sys.service配置失败: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/systemd/reload")
async def systemd_reload():
    """重载 systemd 配置"""
    try:
        subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
        return {"success": True, "message": "systemd 配置已重载"}
    except Exception as e:
        logger.error(f"systemd reload 失败: {str(e)}")
        return {"success": False, "error": "systemd reload 失败: " + str(e)}

@app.post("/api/systemd/enable-ptp4l")
async def systemd_enable_ptp4l():
    """设置 ptp4l.service 开机自启"""
    try:
        subprocess.run(["sudo", "systemctl", "enable", "ptp4l.service"], check=True)
        return {"success": True, "message": "ptp4l.service 已设置为开机自启"}
    except Exception as e:
        logger.error(f"enable ptp4l 失败: {str(e)}")
        return {"success": False, "error": "enable ptp4l 失败: " + str(e)}

@app.post("/api/systemd/start-service")
async def systemd_start_service(action: ServiceAction):
    """启动指定的systemd服务"""
    try:
        logger.info(f"启动服务: {action.service_name}")
        if not action.service_name.endswith('.service'):
            return {"success": False, "error": "服务名称必须以.service结尾"}
        subprocess.run(["sudo", "systemctl", "start", action.service_name], check=True)
        logger.info(f"服务 {action.service_name} 启动成功")
        return {"success": True, "message": f"{action.service_name} 已启动", "service_name": action.service_name}
    except subprocess.CalledProcessError as e:
        logger.error(f"启动服务 {action.service_name} 失败: {str(e)}")
        return {"success": False, "error": f"启动服务 {action.service_name} 失败: {str(e)}"}
    except Exception as e:
        logger.error(f"启动服务 {action.service_name} 时发生错误: {str(e)}")
        return {"success": False, "error": f"启动服务 {action.service_name} 失败: {str(e)}"}

@app.post("/api/systemd/stop-service")
async def systemd_stop_service(action: ServiceAction):
    """停止指定的systemd服务"""
    try:
        logger.info(f"停止服务: {action.service_name}")
        if not action.service_name.endswith('.service'):
            return {"success": False, "error": "服务名称必须以.service结尾"}
        subprocess.run(["sudo", "systemctl", "stop", action.service_name], check=True)
        logger.info(f"服务 {action.service_name} 停止成功")
        return {"success": True, "message": f"{action.service_name} 已停止", "service_name": action.service_name}
    except subprocess.CalledProcessError as e:
        logger.error(f"停止服务 {action.service_name} 失败: {str(e)}")
        return {"success": False, "error": f"停止服务 {action.service_name} 失败: {str(e)}"}
    except Exception as e:
        logger.error(f"停止服务 {action.service_name} 时发生错误: {str(e)}")
        return {"success": False, "error": f"停止服务 {action.service_name} 失败: {str(e)}"}

@app.post("/api/systemd/restart-service")
async def systemd_restart_service(action: ServiceAction):
    """重启指定的systemd服务"""
    try:
        logger.info(f"重启服务: {action.service_name}")
        if not action.service_name.endswith('.service'):
            return {"success": False, "error": "服务名称必须以.service结尾"}
        subprocess.run(["sudo", "systemctl", "restart", action.service_name], check=True)
        logger.info(f"服务 {action.service_name} 重启成功")
        return {"success": True, "message": f"{action.service_name} 已重启", "service_name": action.service_name}
    except subprocess.CalledProcessError as e:
        logger.error(f"重启服务 {action.service_name} 失败: {str(e)}")
        return {"success": False, "error": f"重启服务 {action.service_name} 失败: {str(e)}"}
    except Exception as e:
        logger.error(f"重启服务 {action.service_name} 时发生错误: {str(e)}")
        return {"success": False, "error": f"重启服务 {action.service_name} 失败: {str(e)}"}

@app.get("/api/systemd/logs/{service}")
async def systemd_logs(service: str, lines: int = 100):
    """获取 systemd 服务日志（最新N行）"""
    if service not in ["ptp4l.service", "ptp4l1.service", "phc2sys.service"]:
        raise HTTPException(status_code=400, detail="不支持的服务名")
    try:
        result = subprocess.run([
            "sudo", "journalctl", "-u", service, f"-n{lines}", "--no-pager"
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8")
        return {"service": service, "logs": result.stdout}
    except Exception as e:
        logger.error(f"获取日志失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取日志失败")

@app.get("/api/systemd/status/{service}")
async def systemd_status(service: str):
    """获取 systemd 服务状态"""
    if service not in ["ptp4l.service", "ptp4l1.service", "phc2sys.service"]:
        raise HTTPException(status_code=400, detail="不支持的服务名")
    try:
        result = subprocess.run([
            "sudo", "systemctl", "status", service, "--no-pager"
        ], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, encoding="utf-8")
        return {"service": service, "status": result.stdout}
    except Exception as e:
        logger.error(f"获取状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取状态失败")

@app.post("/ptp/status")
def get_ptp_status(request: PTPStatusRequest):
    try:
        # Construct the pmc command
        cmd = [
            "pmc",
            "-u",
            "-b", "0",
            "GET TIME_STATUS_NP",
            "-d", str(request.domain),
            "-s", request.uds_path
        ]
        
        # Execute the command
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to execute pmc command: {result.stderr}"
            )
        
        # Parse the output to extract gmPresent and gmIdentity
        output = result.stdout
        
        # Extract gmPresent
        gm_present_match = re.search(r'gmPresent\s+(\w+)', output)
        gm_present = gm_present_match.group(1) if gm_present_match else None
        
        # Extract gmIdentity
        gm_identity_match = re.search(r'gmIdentity\s+([0-9a-f.]+)', output)
        gm_identity = gm_identity_match.group(1) if gm_identity_match else None
        
        if gm_present is None or gm_identity is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to parse pmc command output"
            )
        
        return {
            "gmPresent": gm_present,
            "gmIdentity": gm_identity
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/ptp-timestatus")
async def get_ptp_timestatus(domain: int = 127, uds_path: str = "/var/run/ptp4l"):
    """
    获取PTP时间状态信息
    通过运行 pmc -u -b 0 'GET TIME_STATUS_NP' -d {domain} -s {uds_path} 命令
    """
    try:
        logger.info(f"获取PTP时间状态，domain: {domain}, uds_path: {uds_path}")
        
        # 构造pmc命令
        cmd = [
            "pmc",
            "-u",
            "-b", "0",
            "GET TIME_STATUS_NP",
            "-d", str(domain),
            "-s", uds_path
        ]
        
        logger.debug(f"执行命令: {' '.join(cmd)}")
        
        # 执行命令
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            logger.error(f"pmc命令执行失败: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"pmc命令执行失败: {result.stderr}"
            )
        
        # 解析输出
        output = result.stdout
        logger.debug(f"pmc命令输出: {output}")
        
        # 初始化返回结果
        time_status = {
            "master_offset": None,
            "ingress_time": None,
            "cumulativeScaledRateOffset": None,
            "scaledLastGmPhaseChange": None,
            "gmTimeBaseIndicator": None,
            "lastGmPhaseChange": None,
            "gmPresent": None,
            "gmIdentity": None
        }
        
        # 解析各种状态信息
        patterns = {
            "master_offset": r'master_offset\s+([0-9-]+)',
            "ingress_time": r'ingress_time\s+([0-9]+)',
            "cumulativeScaledRateOffset": r'cumulativeScaledRateOffset\s+([0-9-]+)',
            "scaledLastGmPhaseChange": r'scaledLastGmPhaseChange\s+([0-9-]+)',
            "gmTimeBaseIndicator": r'gmTimeBaseIndicator\s+([0-9]+)',
            "lastGmPhaseChange": r'lastGmPhaseChange\s+([0-9-]+)',
            "gmPresent": r'gmPresent\s+(\w+)',
            "gmIdentity": r'gmIdentity\s+([0-9a-f.]+)'
        }
        
        for key, pattern in patterns.items():
            match = re.search(pattern, output)
            if match:
                value = match.group(1)
                # 对于数值类型，尝试转换为整数
                if key in ["master_offset", "ingress_time", "cumulativeScaledRateOffset", 
                          "scaledLastGmPhaseChange", "gmTimeBaseIndicator", "lastGmPhaseChange"]:
                    try:
                        time_status[key] = int(value)
                    except ValueError:
                        time_status[key] = value
                else:
                    time_status[key] = value
        
        logger.info(f"PTP时间状态解析完成")
        
        return {"success": True, **time_status}
        
    except subprocess.TimeoutExpired:
        logger.error("pmc命令执行超时")
        raise HTTPException(status_code=500, detail="pmc命令执行超时")
    except FileNotFoundError:
        logger.error("pmc命令未找到")
        raise HTTPException(status_code=500, detail="pmc命令未找到，请确保已安装linuxptp工具包")
    except Exception as e:
        logger.error(f"获取PTP时间状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PTP时间状态失败: {str(e)}")

@app.get("/api/ptp-port-status")
async def get_ptp_port_status(domain: int = 127, uds_path: str = "/var/run/ptp4l"):
    """
    获取PTP端口状态信息
    通过运行 pmc -u -b 0 'GET PORT_DATA_SET' -d {domain} -s {uds_path} 命令
    """
    try:
        logger.info(f"获取PTP端口状态，domain: {domain}, uds_path: {uds_path}")
        
        # 构造pmc命令
        cmd = [
            "pmc",
            "-u",
            "-b", "0",
            "GET PORT_DATA_SET",
            "-d", str(domain),
            "-s", uds_path
        ]
        
        logger.debug(f"执行命令: {' '.join(cmd)}")
        
        # 执行命令
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            logger.error(f"pmc命令执行失败: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"pmc命令执行失败: {result.stderr}"
            )
        
        # 解析输出
        output = result.stdout
        logger.debug(f"pmc命令输出: {output}")
        
        # 初始化返回结果
        port_status = {
            "portIdentity": None,
            "portState": None,
            "logMinDelayReqInterval": None,
            "peerMeanPathDelay": None,
            "logAnnounceInterval": None,
            "announceReceiptTimeout": None,
            "logSyncInterval": None,
            "delayMechanism": None,
            "logMinPdelayReqInterval": None,
            "versionNumber": None
        }
        
        # 解析各种端口状态信息
        patterns = {
            "portIdentity": r'portIdentity\s+([0-9a-f.]+)',
            "portState": r'portState\s+(\w+)',
            "logMinDelayReqInterval": r'logMinDelayReqInterval\s+([0-9-]+)',
            "peerMeanPathDelay": r'peerMeanPathDelay\s+([0-9]+)',
            "logAnnounceInterval": r'logAnnounceInterval\s+([0-9-]+)',
            "announceReceiptTimeout": r'announceReceiptTimeout\s+([0-9]+)',
            "logSyncInterval": r'logSyncInterval\s+([0-9-]+)',
            "delayMechanism": r'delayMechanism\s+(\w+)',
            "logMinPdelayReqInterval": r'logMinPdelayReqInterval\s+([0-9-]+)',
            "versionNumber": r'versionNumber\s+([0-9]+)'
        }
        
        for key, pattern in patterns.items():
            match = re.search(pattern, output)
            if match:
                value = match.group(1)
                # 对于数值类型，尝试转换为整数
                if key in ["logMinDelayReqInterval", "peerMeanPathDelay", "logAnnounceInterval", 
                          "announceReceiptTimeout", "logSyncInterval", "logMinPdelayReqInterval", "versionNumber"]:
                    try:
                        port_status[key] = int(value)
                    except ValueError:
                        port_status[key] = value
                else:
                    port_status[key] = value
        
        logger.info(f"PTP端口状态解析完成")
        
        return {"success": True, **port_status}
        
    except subprocess.TimeoutExpired:
        logger.error("pmc命令执行超时")
        raise HTTPException(status_code=500, detail="pmc命令执行超时")
    except FileNotFoundError:
        logger.error("pmc命令未找到")
        raise HTTPException(status_code=500, detail="pmc命令未找到，请确保已安装linuxptp工具包")
    except Exception as e:
        logger.error(f"获取PTP端口状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PTP端口状态失败: {str(e)}")

@app.get("/api/ptp-currenttimedata")
async def get_ptp_currenttimedata(domain: int = 127, uds_path: str = "/var/run/ptp4l"):
    """
    获取PTP当前时间数据信息
    通过运行 pmc -u -b 0 'GET CURRENT_DATA_SET' -d {domain} -s {uds_path} 命令
    """
    try:
        logger.info(f"获取PTP当前时间数据，domain: {domain}, uds_path: {uds_path}")
        
        # 构造pmc命令
        cmd = [
            "pmc",
            "-u",
            "-b", "0",
            "GET CURRENT_DATA_SET",
            "-d", str(domain),
            "-s", uds_path
        ]
        
        logger.debug(f"执行命令: {' '.join(cmd)}")
        
        # 执行命令
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
        
        if result.returncode != 0:
            logger.error(f"pmc命令执行失败: {result.stderr}")
            raise HTTPException(
                status_code=500,
                detail=f"pmc命令执行失败: {result.stderr}"
            )
        
        # 解析输出
        output = result.stdout
        logger.debug(f"pmc命令输出: {output}")
        
        # 初始化返回结果
        current_data = {
            "stepsRemoved": None,
            "offsetFromMaster": None,
            "meanPathDelay": None
        }
        
        # 解析各种当前数据信息
        patterns = {
            "stepsRemoved": r'stepsRemoved\s+([0-9]+)',
            "offsetFromMaster": r'offsetFromMaster\s+([0-9.-]+)',
            "meanPathDelay": r'meanPathDelay\s+([0-9.]+)'
        }
        
        for key, pattern in patterns.items():
            match = re.search(pattern, output)
            if match:
                value = match.group(1)
                # 对于数值类型，尝试转换为整数
                try:
                    current_data[key] = float(value)
                except ValueError:
                    current_data[key] = value
        
        logger.info(f"PTP当前时间数据解析完成")
        
        return {"success": True, **current_data}
        
    except subprocess.TimeoutExpired:
        logger.error("pmc命令执行超时")
        raise HTTPException(status_code=500, detail="pmc命令执行超时")
    except FileNotFoundError:
        logger.error("pmc命令未找到")
        raise HTTPException(status_code=500, detail="pmc命令未找到，请确保已安装linuxptp工具包")
    except Exception as e:
        logger.error(f"获取PTP当前时间数据失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取PTP当前时间数据失败: {str(e)}")

@app.get("/api/clock-source-state")
async def get_clock_source_state():
    """获取时钟源状态"""
    try:
        state = await clock_source_state.get_state()
        return state
    except Exception as e:
        logger.error(f"获取时钟源状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取时钟源状态失败")

@app.post("/api/clock-source-state")
async def update_clock_source_state(source: str):
    """更新时钟源状态"""
    try:
        await clock_source_state.update(source)
        return {"status": "success", "message": "时钟源状态已更新"}
    except Exception as e:
        logger.error(f"更新时钟源状态失败: {str(e)}")
        raise HTTPException(status_code=500, detail="更新时钟源状态失败")

@app.get("/api/clock-sync-mode")
async def get_clock_sync_mode():
    """
    获取当前主机锁相方式
    
    Returns:
        str: 当前锁相方式 ("internal", "BB", "PTP")
        - 如果phc2sys服务正在运行，返回"PTP"
        - 否则返回"internal"
    """
    try:
        current_mode = get_current_clock_sync_mode()
        phc2sys_running = check_phc2sys_service_status()
        result = {
            "success": True,
            "mode": current_mode,
            "phc2sys_running": phc2sys_running
        }
        if current_mode == "PTP":
            last_clock_info = await get_last_clock_source_from_logs()
            if last_clock_info:
                result["current_clock_source"] = last_clock_info[0]
            else:
                result["current_clock_source"] = None
        return result
    except Exception as e:
        logger.error(f"获取锁相方式失败: {str(e)}")
        raise HTTPException(status_code=500, detail="获取锁相方式失败")

@app.put("/api/clock-sync-mode")
async def update_clock_sync_mode(sync_mode: ClockSyncMode):
    """
    设置主机锁相方式
    
    Args:
        sync_mode: 包含要设置的锁相方式 ("internal", "BB", "PTP")
    
    Returns:
        dict: 操作结果和当前锁相方式
    """
    try:
        mode = sync_mode.mode
        logger.info(f"设置锁相方式: {mode}")
        
        # 检查当前phc2sys服务状态
        phc2sys_running = check_phc2sys_service_status()
        logger.info(f"当前phc2sys服务状态: {'运行中' if phc2sys_running else '未运行'}")
        
        # 根据传入的锁相方式进行操作
        if mode in ["internal", "BB"]:
            # 如果phc2sys服务正在运行，需要停止它
            if phc2sys_running:
                logger.info("停止phc2sys服务...")
                result = subprocess.run(
                    ["systemctl", "stop", "phc2sys.service"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode != 0:
                    logger.error(f"停止phc2sys服务失败: {result.stderr}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"停止phc2sys服务失败: {result.stderr}"
                    )
                
                logger.info("phc2sys服务已停止")
            else:
                logger.info("phc2sys服务未运行，无需操作")
        
        elif mode == "PTP":
            # 对于PTP模式，需要确保phc2sys服务运行
            if not phc2sys_running:
                logger.info("启动phc2sys服务...")
                result = subprocess.run(
                    ["systemctl", "start", "phc2sys.service"],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode != 0:
                    logger.error(f"启动phc2sys服务失败: {result.stderr}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"启动phc2sys服务失败: {result.stderr}"
                    )
                
                logger.info("phc2sys服务已启动")
            else:
                logger.info("phc2sys服务已在运行")
        
        # 获取操作后的当前状态
        current_mode = get_current_clock_sync_mode()
        current_phc2sys_running = check_phc2sys_service_status()
        
        logger.info(f"锁相方式设置完成，当前模式: {current_mode}")
        
        result = {
            "success": True,
            "message": f"锁相方式已设置为: {mode}",
            "requested_mode": mode,
            "current_mode": current_mode,
            "phc2sys_running": current_phc2sys_running
        }
        if current_mode == "PTP":
            last_clock_info = await get_last_clock_source_from_logs()
            if last_clock_info:
                result["current_clock_source"] = last_clock_info[0]
            else:
                result["current_clock_source"] = None
        return result
        
    except HTTPException:
        # 重新抛出HTTPException，不进行包装
        raise
    except Exception as e:
        logger.error(f"设置锁相方式失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"设置锁相方式失败: {str(e)}")

async def monitor_phc2sys_logs():
    """监控phc2sys日志，检测时钟源变化"""
    logger.info("开始监控phc2sys日志...")
    while True:
        try:
            # 使用journalctl命令获取phc2sys的日志
            cmd = ["journalctl", "-u", "phc2sys.service", "-f", "-n", "0"]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )

            while True:
                line = await process.stdout.readline()
                if not line:
                    break

                line_str = line.decode().strip()
                logger.debug(f"收到日志: {line_str}")

                # 匹配时钟源选择信息
                match = re.search(r'selecting (\S+) (?:as out-of-domain source clock|for synchronization)', line_str)
                if match:
                    source = match.group(1)
                    # 排除 CLOCK_REALTIME
                    if source == "CLOCK_REALTIME":
                        continue
                    
                    # 检查是否是异常状态
                    is_failed = "for synchronization" in line_str
                    logger.info(f"检测到时钟源{'异常' if is_failed else '变化'}: {source}")
                    await clock_source_state.update(source, is_failed)

                # 检测同步状态更新
                elif "CLOCK_REALTIME phc offset" in line_str:
                    # 重置超时计时器
                    async with clock_source_state._lock:
                        clock_source_state.last_sync_time = datetime.now()
                        if clock_source_state.is_failed:
                            clock_source_state.is_failed = False
                            logger.info("时钟源恢复正常")

        except Exception as e:
            logger.error(f"监控phc2sys日志时发生错误: {str(e)}")
            await asyncio.sleep(5)  # 发生错误时等待5秒后重试

async def get_last_clock_source_from_logs() -> Optional[tuple[str, bool]]:
    """
    从历史日志中获取最近的时钟源信息
    返回: (时钟源名称, 是否异常)
    """
    try:
        # 获取最近的1000行日志
        cmd = ["journalctl", "-u", "phc2sys.service", "-n", "1000"]
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            logger.error(f"获取历史日志失败: {result.stderr}")
            return None

        # 按时间倒序处理日志
        lines = result.stdout.splitlines()
        for line in reversed(lines):
            # 匹配时钟源选择信息
            match = re.search(r'selecting (\S+) (?:as out-of-domain source clock|for synchronization)', line)
            if match:
                source = match.group(1)
                # 排除 CLOCK_REALTIME
                if source == "CLOCK_REALTIME":
                    continue
                # 检查是否是异常状态
                is_failed = "for synchronization" in line
                logger.info(f"从历史日志中找到最近的时钟源: {source}, 状态: {'异常' if is_failed else '正常'}")
                return source, is_failed

        logger.info("历史日志中未找到时钟源信息")
        return None
    except Exception as e:
        logger.error(f"扫描历史日志时发生错误: {str(e)}")
        return None

@app.on_event("startup")
async def startup_event():
    """服务启动时的事件处理"""
    logger.info("=== 服务启动信息 ===")
    logger.info("检查必要的文件权限...")
    
    # 检查必要的文件权限
    check_file_permissions(PTP4L_SERVICE_PATH)
    check_file_permissions(PHC2SYS_SERVICE_PATH)
    
    # 检查并启动必要的PTP服务
    logger.info("检查PTP服务状态...")
    ptp4l_started = start_service_if_not_running("ptp4l.service")
    ptp4l1_started = start_service_if_not_running("ptp4l1.service")
    
    if ptp4l_started and ptp4l1_started:
        logger.info("所有PTP服务已启动或已在运行")
        # 等待PTP服务完全启动并稳定
        logger.info("等待PTP服务稳定运行...")
        await asyncio.sleep(5)
    else:
        logger.warning("部分PTP服务启动失败，可能影响功能")
    
    # 检查phc2sys服务状态，如果已启动则重启以获取时钟源信息
    logger.info("检查phc2sys服务状态...")
    phc2sys_running = check_phc2sys_service_status()
    if phc2sys_running:
        logger.info("phc2sys服务正在运行，重启以获取最新时钟源信息...")
        try:
            result = subprocess.run(
                ["systemctl", "restart", "phc2sys.service"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            if result.returncode == 0:
                logger.info("phc2sys服务重启成功")
                # 等待服务完全启动
                await asyncio.sleep(3)
            else:
                logger.error(f"phc2sys服务重启失败: {result.stderr}")
        except Exception as e:
            logger.error(f"重启phc2sys服务时发生异常: {str(e)}")
    else:
        logger.info("phc2sys服务未运行，无需重启")
    
    # 从历史日志中获取最近的时钟源信息
    last_clock_info = await get_last_clock_source_from_logs()
    if last_clock_info:
        source, is_failed = last_clock_info
        await clock_source_state.update(source, is_failed)
        logger.info(f"已从历史日志中恢复时钟源状态: {source}")
    
    # 启动日志监控任务
    asyncio.create_task(monitor_phc2sys_logs())

@app.get("/api/systemd/service-interfaces/{service}")
async def get_service_interfaces(service: str):
    """
    获取指定service文件中配置的网络接口
    
    Args:
        service: 服务名称，如 ptp4l.service 或 ptp4l1.service
    """
    if service not in ["ptp4l.service", "ptp4l1.service"]:
        raise HTTPException(status_code=400, detail="不支持的服务名")
    
    try:
        service_path = f"/etc/systemd/system/{service}"
        
        if not os.path.exists(service_path):
            logger.error(f"Service文件不存在: {service_path}")
            raise HTTPException(status_code=404, detail=f"Service文件不存在: {service_path}")
        
        with open(service_path, 'r') as f:
            content = f.read()
        
        # 解析ExecStart行中的网络接口
        interfaces = []
        for line in content.split('\n'):
            if line.strip().startswith('ExecStart='):
                # 提取 -i 参数后面的接口名
                matches = re.findall(r'-i\s+(\S+)', line)
                interfaces.extend(matches)
                break
        
        logger.info(f"从 {service} 中解析到网络接口: {interfaces}")
        return {"success": True, "interfaces": interfaces}
        
    except Exception as e:
        logger.error(f"获取service网络接口失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"获取service网络接口失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    logger.info("=== 服务启动信息 ===")
    logger.info(f"当前用户: {os.getuid()} ({pwd.getpwuid(os.getuid()).pw_name})")
    logger.info(f"当前用户组: {os.getgid()} ({grp.getgrgid(os.getgid()).gr_name})")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="debug") 