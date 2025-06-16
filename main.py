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
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Dict, List, Optional

PTP4L_SERVICE_PATH = "/etc/systemd/system/ptp4l.service"
NETWORK_INFO_PATH = "/etc/linuxptp/interfaces.json"
PHC2SYS_SERVICE_PATH = "/etc/systemd/system/phc2sys.service"

# 配置日志
logging.basicConfig(level=logging.DEBUG)
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

class ConfigUpdate(BaseModel):
    """
    配置更新请求模型
    """
    key: str
    value: str

class Ptp4lInterfaceUpdate(BaseModel):
    interfaces: List[str] = Field(..., min_items=1, max_items=2, description="要写入的网卡名，1或2个")

class Phc2sysDomainUpdate(BaseModel):
    domain: int

class PTPStatusRequest(BaseModel):
    domain: int
    uds_path: str

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
async def get_ptp_config():
    """
    读取 PTP 配置文件内容并解析为键值对
    """
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
            return {"global": {}}
        
        # 解析配置文件内容
        config_dict = parse_ptp_config(content)
        logger.info("成功解析配置文件")
        return config_dict
        
    except PermissionError as e:
        logger.error(f"权限错误: {str(e)}")
        raise HTTPException(status_code=403, detail="没有权限读取配置文件")
    except Exception as e:
        logger.error(f"发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/ptp-config")
async def update_config(update: ConfigUpdate):
    """
    更新配置文件中的指定键值对（只用body里的key）
    """
    config_path = "/etc/linuxptp/ptp4l.conf"
    key = update.key
    value = update.value
    try:
        logger.info(f"开始更新配置，键: {key}, 值: {value}")
        if not os.path.exists(config_path):
            logger.error(f"配置文件不存在: {config_path}")
            raise HTTPException(status_code=404, detail="PTP configuration file not found")
        if not os.access(config_path, os.W_OK):
            logger.error("当前用户没有写入权限")
            raise HTTPException(status_code=403, detail="没有权限修改配置文件")
        if update_config_file(config_path, key, value):
            logger.info("配置更新成功")
            return {"status": "success", "message": "配置已更新"}
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
    根据传入网卡名修改ptp4l.service文件中的ExecStart行
    """
    try:
        with open(PTP4L_SERVICE_PATH, 'r') as f:
            lines = f.readlines()
        new_lines = []
        updated = False
        for line in lines:
            if line.strip().startswith("ExecStart="):
                # 保留原有的 -f ... -s -m 等参数，只替换 -i ...
                # 匹配 -i xxx 的部分
                execstart_prefix = line.split('ExecStart=', 1)[0] + 'ExecStart='
                rest = line.split('ExecStart=', 1)[1]
                # 去掉所有 -i xxx
                rest = re.sub(r'-i\s+\S+\s*', '', rest)
                # 构造新的 -i 参数
                i_args = ''.join([f'-i {iface} ' for iface in update.interfaces])
                # 合成新行
                new_line = execstart_prefix + f"/usr/sbin/ptp4l {i_args}" + rest.lstrip()
                new_lines.append(new_line)
                updated = True
            else:
                new_lines.append(line)
        if not updated:
            logger.error("未找到 ExecStart 行")
            raise HTTPException(status_code=400, detail="未找到 ExecStart 行")
        with open(PTP4L_SERVICE_PATH, 'w') as f:
            f.writelines(new_lines)
        return {"status": "success", "message": "ExecStart已更新", "interfaces": update.interfaces}
    except Exception as e:
        logger.error(f"修改ptp4l.service失败: {str(e)}")
        raise HTTPException(status_code=500, detail="修改ptp4l.service失败")

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

@app.put("/api/phc2sys-domain")
async def update_phc2sys_domain(update: Phc2sysDomainUpdate):
    """
    修改phc2sys.service文件中ExecStart行的-n参数
    """
    try:
        with open(PHC2SYS_SERVICE_PATH, 'r') as f:
            lines = f.readlines()
        new_lines = []
        updated = False
        for line in lines:
            if line.strip().startswith("ExecStart="):
                # 替换 -n 后面的数字
                new_line = re.sub(r'(-n\s+)\d+', r'\g<1>{}'.format(update.domain), line)
                new_lines.append(new_line)
                updated = True
            else:
                new_lines.append(line)
        if not updated:
            logger.error("未找到 ExecStart 行")
            raise HTTPException(status_code=400, detail="未找到 ExecStart 行")
        with open(PHC2SYS_SERVICE_PATH, 'w') as f:
            f.writelines(new_lines)
        return {"status": "success", "message": "ExecStart已更新", "domain": update.domain}
    except Exception as e:
        logger.error(f"修改phc2sys.service失败: {str(e)}")
        raise HTTPException(status_code=500, detail="修改phc2sys.service失败")

@app.post("/api/systemd/reload")
async def systemd_reload():
    """重载 systemd 配置"""
    try:
        subprocess.run(["sudo", "systemctl", "daemon-reload"], check=True)
        return {"status": "success", "message": "systemd 配置已重载"}
    except Exception as e:
        logger.error(f"systemd reload 失败: {str(e)}")
        raise HTTPException(status_code=500, detail="systemd reload 失败")

@app.post("/api/systemd/enable-ptp4l")
async def systemd_enable_ptp4l():
    """设置 ptp4l.service 开机自启"""
    try:
        subprocess.run(["sudo", "systemctl", "enable", "ptp4l.service"], check=True)
        return {"status": "success", "message": "ptp4l.service 已设置为开机自启"}
    except Exception as e:
        logger.error(f"enable ptp4l 失败: {str(e)}")
        raise HTTPException(status_code=500, detail="enable ptp4l 失败")

@app.post("/api/systemd/start-ptp4l")
async def systemd_start_ptp4l():
    """启动 ptp4l.service"""
    try:
        subprocess.run(["sudo", "systemctl", "start", "ptp4l.service"], check=True)
        return {"status": "success", "message": "ptp4l.service 已启动"}
    except Exception as e:
        logger.error(f"start ptp4l 失败: {str(e)}")
        raise HTTPException(status_code=500, detail="start ptp4l 失败")

@app.post("/api/systemd/start-phc2sys")
async def systemd_start_phc2sys():
    """启动 phc2sys.service"""
    try:
        subprocess.run(["sudo", "systemctl", "start", "phc2sys.service"], check=True)
        return {"status": "success", "message": "phc2sys.service 已启动"}
    except Exception as e:
        logger.error(f"start phc2sys 失败: {str(e)}")
        raise HTTPException(status_code=500, detail="start phc2sys 失败")

@app.get("/api/systemd/logs/{service}")
async def systemd_logs(service: str, lines: int = 100):
    """获取 systemd 服务日志（最新N行）"""
    if service not in ["ptp4l.service", "phc2sys.service"]:
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
    if service not in ["ptp4l.service", "phc2sys.service"]:
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

if __name__ == "__main__":
    import uvicorn
    logger.info("=== 服务启动信息 ===")
    logger.info(f"当前用户: {os.getuid()} ({pwd.getpwuid(os.getuid()).pw_name})")
    logger.info(f"当前用户组: {os.getgid()} ({grp.getgrgid(os.getgid()).gr_name})")
    uvicorn.run(app, host="0.0.0.0", port=8001, log_level="debug") 