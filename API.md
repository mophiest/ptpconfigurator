# PTP Configurator API 文档

## 概述

PTP Configurator API 是一个用于管理 PTP (Precision Time Protocol) 配置和服务的 RESTful API。该 API 提供了配置文件的读取、修改，网络接口管理，systemd 服务控制以及 PTP 状态监控等功能。

## 基础信息

- **基础URL**: `http://localhost:8001`
- **协议**: HTTP/HTTPS
- **数据格式**: JSON
- **认证**: 无（需要 root 权限运行服务）

## 通用响应格式

### 成功响应
```json
{
    "status": "success",
    "message": "操作成功",
    "data": {}
}
```

### 错误响应
```json
{
    "detail": "错误描述"
}
```

## API 端点

### 1. PTP 配置文件管理

#### 1.1 获取 PTP 配置
**GET** `/api/ptp-config`

获取 `/etc/linuxptp/ptp4l.conf` 文件内容，解析为键值对格式。

**响应示例**:
```json
{
    "global": {
        "twoStepFlag": "1",
        "slaveOnly": "0",
        "priority1": "127",
        "priority2": "128",
        "domainNumber": "127",
        "utc_offset": "0",
        "clockClass": "248",
        "clockAccuracy": "0xFE",
        "offsetScaledLogVariance": "0xFFFF",
        "free_running": "0",
        "freq_est_interval": "1",
        "dscp_event": "46",
        "dscp_general": "46",
        "logAnnounceInterval": "0",
        "logSyncInterval": "-3",
        "logMinDelayReqInterval": "-3",
        "logMinPdelayReqInterval": "0",
        "announceReceiptTimeout": "6",
        "syncReceiptTimeout": "6",
        "delayAsymmetry": "0",
        "fault_reset_interval": "4",
        "neighborPropDelayThresh": "20000000",
        "assume_two_step": "0",
        "logging_level": "6",
        "path_trace_enabled": "0",
        "follow_up_info": "0",
        "hybrid_e2e": "0",
        "net_sync_monitor": "0",
        "tx_timestamp_timeout": "30",
        "use_syslog": "1",
        "verbose": "0",
        "summary_interval": "0",
        "kernel_leap": "1",
        "check_fup_sync": "0",
        "pi_proportional_const": "0.0",
        "pi_integral_const": "0.0",
        "pi_proportional_scale": "0.0",
        "pi_proportional_exponent": "-0.3",
        "pi_proportional_norm_max": "0.7",
        "pi_integral_scale": "0.0",
        "pi_integral_exponent": "0.4",
        "pi_integral_norm_max": "0.3",
        "step_threshold": "0.0",
        "first_step_threshold": "0.00002",
        "max_frequency": "900000000",
        "clock_servo": "pi",
        "sanity_freq_limit": "200000000",
        "ntpshm_segment": "0",
        "transportSpecific": "0x0",
        "ptp_dst_mac": "01:1B:19:00:00:00",
        "p2p_dst_mac": "01:80:C2:00:00:0E",
        "udp_ttl": "1",
        "udp6_scope": "0x0E",
        "uds_address": "/var/run/ptp4l",
        "network_transport": "UDPv4",
        "delay_mechanism": "E2E",
        "time_stamping": "hardware",
        "tsproc_mode": "filter",
        "delay_filter": "moving_median",
        "delay_filter_length": "10",
        "egressLatency": "0",
        "ingressLatency": "0",
        "boundary_clock_jbod": "0",
        "productDescription": ";;",
        "revisionData": ";;",
        "manufacturerIdentity": "00:00:00",
        "userDescription": ";",
        "timeSource": "0xA0"
    }
}
```

#### 1.2 修改 PTP 配置
**PUT** `/api/ptp-config`

修改 PTP 配置文件中的指定键值对。

**请求体**:
```json
{
    "key": "priority1",
    "value": "128"
}
```

**响应示例**:
```json
{
    "status": "success",
    "message": "配置已更新"
}
```

### 2. 网络接口管理

#### 2.1 获取网络接口信息
**GET** `/api/network-interfaces`

获取本地所有网络接口及其状态信息。

**响应示例**:
```json
{
    "interfaces": [
        {
            "name": "eth0",
            "is_up": true,
            "mac": "00:11:22:33:44:55",
            "ip": "192.168.1.124"
        },
        {
            "name": "lo",
            "is_up": true,
            "mac": null,
            "ip": "127.0.0.1"
        }
    ]
}
```

#### 2.2 保存网络接口信息
**POST** `/api/network-interfaces/save`

获取并保存本地所有网络接口信息到文件。

**响应示例**:
```json
{
    "status": "success",
    "message": "已保存",
    "file": "/etc/linuxptp/interfaces.json"
}
```

### 3. PTP4L 服务配置

#### 3.1 修改 PTP4L 服务接口
**PUT** `/api/ptp4l-service-interface`

根据传入的网卡名修改 `/etc/systemd/system/ptp4l.service` 文件中的 ExecStart 行。

**请求体**:
```json
{
    "interfaces": ["ens47f0", "ens47f1"]
}
```

**响应示例**:
```json
{
    "status": "success",
    "message": "ExecStart已更新",
    "interfaces": ["ens47f0", "ens47f1"]
}
```

### 4. PHC2SYS 服务配置

#### 4.1 修改 PHC2SYS 服务域
**PUT** `/api/phc2sys-domain`

修改 `/etc/systemd/system/phc2sys.service` 文件中 ExecStart 行的 -n 参数。

**请求体**:
```json
{
    "domain": 128
}
```

**响应示例**:
```json
{
    "status": "success",
    "message": "ExecStart已更新",
    "domain": 128
}
```

### 5. Systemd 服务管理

#### 5.1 重载 Systemd 配置
**POST** `/api/systemd/reload`

执行 `systemctl daemon-reload` 命令。

**响应示例**:
```json
{
    "status": "success",
    "message": "systemd 配置已重载"
}
```

#### 5.2 启用 PTP4L 服务
**POST** `/api/systemd/enable-ptp4l`

设置 ptp4l.service 开机自启。

**响应示例**:
```json
{
    "status": "success",
    "message": "ptp4l.service 已设置为开机自启"
}
```

#### 5.3 启动 PTP4L 服务
**POST** `/api/systemd/start-ptp4l`

启动 ptp4l.service。

**响应示例**:
```json
{
    "status": "success",
    "message": "ptp4l.service 已启动"
}
```

#### 5.4 启动 PHC2SYS 服务
**POST** `/api/systemd/start-phc2sys`

启动 phc2sys.service。

**响应示例**:
```json
{
    "status": "success",
    "message": "phc2sys.service 已启动"
}
```

#### 5.5 获取服务日志
**GET** `/api/systemd/logs/{service}`

获取指定服务的日志信息。

**参数**:
- `service`: 服务名称 (`ptp4l.service` 或 `phc2sys.service`)
- `lines`: 日志行数（可选，默认100）

**示例**:
```bash
GET /api/systemd/logs/ptp4l.service?lines=50
```

**响应示例**:
```json
{
    "service": "ptp4l.service",
    "logs": "-- Logs begin at Mon 2024-01-01 00:00:00 CST...\n..."
}
```

#### 5.6 获取服务状态
**GET** `/api/systemd/status/{service}`

获取指定服务的状态信息。

**参数**:
- `service`: 服务名称 (`ptp4l.service` 或 `phc2sys.service`)

**示例**:
```bash
GET /api/systemd/status/ptp4l.service
```

**响应示例**:
```json
{
    "service": "ptp4l.service",
    "status": "● ptp4l.service - PTP clock\n   Loaded: loaded (/etc/systemd/system/ptp4l.service; enabled)\n   Active: active (running) since Mon 2024-01-01 00:00:00 CST\n..."
}
```

### 6. PTP 状态监控

#### 6.1 获取 PTP 锁定状态
**POST** `/api/ptp/status`

通过 pmc 命令获取 PTP 锁定状态信息。

**请求体**:
```json
{
    "domain": 127,
    "uds_path": "/var/run/ptp4l"
}
```

**响应示例**:
```json
{
    "gmPresent": "true",
    "gmIdentity": "00090d.fffe.00dd25"
}
```

## 使用示例

### 完整的 PTP 配置流程

1. **获取当前配置**:
```bash
curl http://localhost:8001/api/ptp-config
```

2. **修改配置参数**:
```bash
curl -X PUT http://localhost:8001/api/ptp-config \
     -H "Content-Type: application/json" \
     -d '{"key": "priority1", "value": "128"}'
```

3. **获取网络接口**:
```bash
curl http://localhost:8001/api/network-interfaces
```

4. **配置 PTP4L 服务接口**:
```bash
curl -X PUT http://localhost:8001/api/ptp4l-service-interface \
     -H "Content-Type: application/json" \
     -d '{"interfaces": ["ens47f0", "ens47f1"]}'
```

5. **配置 PHC2SYS 服务域**:
```bash
curl -X PUT http://localhost:8001/api/phc2sys-domain \
     -H "Content-Type: application/json" \
     -d '{"domain": 127}'
```

6. **重载 systemd 配置**:
```bash
curl -X POST http://localhost:8001/api/systemd/reload
```

7. **启动服务**:
```bash
curl -X POST http://localhost:8001/api/systemd/start-ptp4l
curl -X POST http://localhost:8001/api/systemd/start-phc2sys
```

8. **检查服务状态**:
```bash
curl http://localhost:8001/api/systemd/status/ptp4l.service
curl http://localhost:8001/api/systemd/status/phc2sys.service
```

9. **查看 PTP 锁定状态**:
```bash
curl -X POST http://localhost:8001/api/ptp/status \
     -H "Content-Type: application/json" \
     -d '{"domain": 127, "uds_path": "/var/run/ptp4l"}'
```

## 错误代码

| HTTP 状态码 | 说明 |
|------------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 注意事项

1. **权限要求**: 所有操作都需要 root 权限，请确保以 root 用户运行服务。
2. **文件路径**: 确保相关配置文件和服务文件存在且有正确的权限。
3. **网络接口**: 修改网络接口配置前，请确保接口名称正确且可用。
4. **服务状态**: 启动服务前，建议先重载 systemd 配置。
5. **日志查看**: 日志接口返回的是最新N行，如需实时日志请使用 `journalctl -f` 命令。

## 依赖要求

- Python 3.7+
- FastAPI
- uvicorn
- psutil
- pydantic

安装依赖:
```bash
pip install -r requirements.txt
```

## 启动服务

```bash
sudo python main.py
```

服务将在 `http://localhost:8001` 启动，可通过 `http://localhost:8001/docs` 访问交互式 API 文档。 