# PTP配置器

一个用于管理PTP（Precision Time Protocol）配置文件和系统d服务的Web应用程序。

## 功能特性

### 系统同步模式管理
- 支持三种同步模式：内部时钟同步、BB时钟同步、PTP时钟同步
- 自动管理phc2sys服务的启动和停止
- 实时显示当前同步状态

### PTP时钟1配置（ptp4l.service）
- **配置文件**: `/etc/linuxptp/ptp4l.conf`
- **UDS路径**: `/var/run/ptp4l`
- **服务名**: `ptp4l.service`
- 支持配置以下参数：
  - PTP Domain
  - Priority1/Priority2
  - Announce Interval
  - Announce Receipt Timeout
  - Sync Interval
  - Sync Receipt Timeout
  - 网络接口选择

### PTP时钟2配置（ptp4l1.service）
- **配置文件**: `/etc/linuxptp/ptp4l1.conf`
- **UDS路径**: `/var/run/ptp4l1`
- **服务名**: `ptp4l1.service`
- 支持与PTP时钟1相同的配置参数
- 独立的状态监控和配置管理

### 实时状态监控
- **PTP时间状态**: 通过`ptp-timestatus`接口获取GM状态
- **PTP端口状态**: 通过`ptp-port-status`接口获取端口状态
- **PTP时间数据**: 通过`ptp-currenttimedata`接口获取时间偏差和路径延时
- 自动每5秒更新状态信息

### 智能服务管理
- 配置更新时自动检测变化
- 根据配置变化决定是否需要reload systemd
- 自动重启相应的PTP服务
- 支持ptp4l.service和ptp4l1.service的独立管理

## API接口

### 系统同步模式
- `GET /api/clock-sync-mode` - 获取当前同步模式
- `PUT /api/clock-sync-mode` - 设置同步模式

### PTP配置管理
- `GET /api/ptp-config?config_file=<path>` - 获取PTP配置
- `PUT /api/ptp-config` - 更新PTP配置（支持单键值对或完整配置）

### PTP状态监控
- `GET /api/ptp-timestatus?uds_path=<path>` - 获取PTP时间状态
- `GET /api/ptp-port-status?uds_path=<path>` - 获取PTP端口状态
- `GET /api/ptp-currenttimedata?uds_path=<path>` - 获取PTP当前时间数据

### 系统d服务管理
- `GET /api/systemd/status/{service}` - 获取服务状态
- `GET /api/systemd/logs/{service}` - 获取服务日志
- `POST /api/systemd/reload` - 重新加载systemd配置
- `POST /api/systemd/restart-service` - 重启服务

### 网络接口管理
- `GET /api/network-interfaces` - 获取网络接口列表

## 前端功能

### 初始化流程
1. 页面加载时自动获取网络接口列表
2. 读取系统同步模式并显示
3. 分别加载PTP时钟1和PTP时钟2的配置
4. 获取PTP状态信息并显示在右侧状态区域
5. 启动定时状态更新（每5秒）

### 配置更新流程
1. 用户修改配置参数
2. 点击提交按钮
3. 系统检测配置是否有变化
4. 如有变化，更新配置文件
5. 执行systemd reload（如需要）
6. 重启相应的PTP服务
7. 更新原始配置记录
8. 重新加载状态信息

### 状态显示
- **时钟锁定状态**: 根据GM状态显示"已锁定"或"未锁定"
- **端口状态**: 显示当前端口状态（SLAVE/MASTER等）
- **时间偏差**: 显示与主时钟的时间偏差
- **路径延时**: 显示网络路径延时
- **GM身份**: 显示主时钟身份信息

## 安装和运行

### 依赖安装
```bash
pip install -r requirements.txt
```

### 启动服务
```bash
python main.py
```

### 访问前端
打开浏览器访问 `http://localhost:8001`

## 文件结构

```
ptpconfigurator/
├── main.py              # FastAPI后端服务
├── requirements.txt     # Python依赖
├── static/             # 前端静态文件
│   ├── index.html      # 主页面
│   ├── css/
│   │   └── style.css   # 样式文件
│   └── js/
│       └── app.js      # 前端逻辑
├── test_api.py         # API测试脚本
└── test_ptp2.py        # PTP时钟2功能测试脚本
```

## 注意事项

1. 需要root权限运行，因为需要修改系统配置文件和重启服务
2. 确保已安装linuxptp工具包
3. 确保ptp4l.service和ptp4l1.service已正确配置
4. 网络接口需要支持PTP硬件时间戳

## 开发说明

### 后端API设计
- 使用FastAPI框架
- 支持CORS跨域请求
- 完整的错误处理和日志记录
- 支持多种配置更新格式

### 前端设计
- 响应式布局，支持不同屏幕尺寸
- 实时状态更新
- 用户友好的通知系统
- 配置变化检测和智能服务管理 