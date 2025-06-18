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

获取 PTP 配置文件内容，解析为键值对格式。

**查询参数**:
- `config_path` (可选): 指定配置文件路径，默认为 `/etc/linuxptp/ptp4l.conf`

**请求示例**:
```
GET /api/ptp-config
GET /api/ptp-config?config_path=/etc/linuxptp/custom.conf
```

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

**查询参数**:
- `config_path` (可选): 指定配置文件路径，默认为 `/etc/linuxptp/ptp4l.conf`

**请求体**:
```json
{
    "key": "priority1",
    "value": "128"
}
```

**请求示例**:
```
PUT /api/ptp-config
PUT /api/ptp-config?config_path=/etc/linuxptp/custom.conf
```

**响应示例**:
```json
{
    "status": "success",
    "message": "配置已更新",
    "config_path": "/etc/linuxptp/ptp4l.conf"
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

### 6. 主机锁相方式管理

#### 6.1 获取当前锁相方式
**GET** `/api/clock-sync-mode`

获取当前主机的锁相方式。

**响应示例**:
```json
{
    "mode": "PTP",
    "phc2sys_running": true
}
```

**说明**:
- `mode`: 当前锁相方式，可能的值：
  - `"PTP"`: phc2sys服务正在运行
  - `"internal"`: phc2sys服务未运行
- `phc2sys_running`: phc2sys服务是否正在运行

#### 6.2 设置锁相方式
**PUT** `/api/clock-sync-mode`

设置主机的锁相方式。

**请求体**:
```json
{
    "mode": "PTP"
}
```

**参数说明**:
- `mode`: 要设置的锁相方式，可选值：
  - `"internal"`: 内部时钟模式，停止phc2sys服务
  - `"BB"`: BB模式，停止phc2sys服务  
  - `"PTP"`: PTP模式，启动phc2sys服务

**响应示例**:
```json
{
    "status": "success",
    "message": "锁相方式已设置为: PTP",
    "requested_mode": "PTP",
    "current_mode": "PTP",
    "phc2sys_running": true
}
```

**操作逻辑**:
- 如果传入 `"internal"` 或 `"BB"`：
  - 如果phc2sys服务正在运行，则停止服务
  - 如果phc2sys服务未运行，则无需操作
- 如果传入 `"PTP"`：
  - 如果phc2sys服务未运行，则启动服务
  - 如果phc2sys服务正在运行，则无需操作

### 7. PTP 状态监控

#### 7.1 获取 PTP 时间状态
**GET** `/api/ptp-timestatus`

通过 pmc 命令获取 PTP 时间状态信息。

**查询参数**:
- `domain` (可选): PTP domain，默认为 127
- `uds_path` (可选): UDS 路径，默认为 "/var/run/ptp4l"

**示例**:
```bash
GET /api/ptp-timestatus
GET /api/ptp-timestatus?domain=127&uds_path=/var/run/ptp4l
```

**响应示例**:
```json
{
    "master_offset": 1234,
    "ingress_time": 1234567890,
    "cumulativeScaledRateOffset": 5678,
    "scaledLastGmPhaseChange": 9012,
    "gmTimeBaseIndicator": 1,
    "lastGmPhaseChange": 3456,
    "gmPresent": "true",
    "gmIdentity": "00090d.fffe.00dd25"
}
```

**字段说明**:
- `master_offset`: 当前设备与主时钟的时间偏移量（同步误差）
- `ingress_time`: 最近接收到 PTP 消息的时间戳
- `cumulativeScaledRateOffset`: 设备与主时钟的频率偏差
- `scaledLastGmPhaseChange`: 主时钟最近一次相位变化的缩放值
- `gmTimeBaseIndicator`: 主时钟时间基准指示器
- `lastGmPhaseChange`: 主时钟最近一次相位变化的详细信息
- `gmPresent`: 是否有主时钟存在
- `gmIdentity`: 主时钟的唯一标识符

#### 7.2 获取 PTP 端口状态
**GET** `/api/ptp-port-status`

通过 pmc 命令获取 PTP 端口状态信息。

**查询参数**:
- `domain` (可选): PTP domain，默认为 127
- `uds_path` (可选): UDS 路径，默认为 "/var/run/ptp4l"

**示例**:
```bash
GET /api/ptp-port-status
GET /api/ptp-port-status?domain=127&uds_path=/var/run/ptp4l
```

**响应示例**:
```json
{
    "portIdentity": "00090d.fffe.00dd25-1",
    "portState": "SLAVE",
    "logMinDelayReqInterval": -3,
    "peerMeanPathDelay": 123456,
    "logAnnounceInterval": 0,
    "announceReceiptTimeout": 6,
    "logSyncInterval": -3,
    "delayMechanism": "E2E",
    "logMinPdelayReqInterval": 0,
    "versionNumber": 2
}
```

**字段说明**:
- `portIdentity`: 端口的唯一标识符
- `portState`: 端口的当前状态（如 SLAVE 表示从时钟）
- `logMinDelayReqInterval`: Delay_Req 消息的最小发送间隔
- `peerMeanPathDelay`: 与对等设备的平均路径延迟
- `logAnnounceInterval`: Announce 消息的发送间隔
- `announceReceiptTimeout`: Announce 消息的接收超时时间
- `logSyncInterval`: Sync 消息的发送间隔
- `delayMechanism`: 延迟测量机制（如端到端或对等）
- `logMinPdelayReqInterval`: Pdelay_Req 消息的最小发送间隔
- `versionNumber`: PTP 协议版本号

#### 7.3 获取 PTP 当前时间数据
**GET** `/api/ptp-currenttimedata`

通过 pmc 命令获取 PTP 当前时间数据信息。

**查询参数**:
- `domain` (可选): PTP domain，默认为 127
- `uds_path` (可选): UDS 路径，默认为 "/var/run/ptp4l"

**示例**:
```bash
GET /api/ptp-currenttimedata
GET /api/ptp-currenttimedata?domain=127&uds_path=/var/run/ptp4l
```

**响应示例**:
```json
{
    "stepsRemoved": 1,
    "offsetFromMaster": 1234,
    "meanPathDelay": 5678
}
```

**字段说明**:
- `stepsRemoved`: 表示从设备到主时钟之间的网络跳数，影响同步路径的复杂性
- `offsetFromMaster`: 表示设备与主时钟的时间偏移量，是时间同步精度的关键指标
- `meanPathDelay`: 表示设备与主时钟之间的平均路径延迟，用于网络延迟补偿

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

9. **查看 PTP 时间状态**:
```bash
curl http://localhost:8001/api/ptp-timestatus
curl http://localhost:8001/api/ptp-timestatus?domain=127&uds_path=/var/run/ptp4l
```

10. **查看 PTP 端口状态**:
```bash
curl http://localhost:8001/api/ptp-port-status
curl http://localhost:8001/api/ptp-port-status?domain=127&uds_path=/var/run/ptp4l
```

11. **查看 PTP 当前时间数据**:
```bash
curl http://localhost:8001/api/ptp-currenttimedata
curl http://localhost:8001/api/ptp-currenttimedata?domain=127&uds_path=/var/run/ptp4l
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