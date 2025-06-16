# PTP Config API

这是一个简单的 API 服务，用于读取和提供 PTP 配置文件的内容。

## 功能

- 提供 REST API 接口读取 `/etc/linuxptp/ptp4l.conf` 文件内容
- 支持跨域请求（CORS）
- 错误处理和异常报告

## 安装

1. 安装依赖：
```bash
pip install -r requirements.txt
```

## 运行

启动服务：
```bash
python main.py
```

服务将在 `http://localhost:8000` 运行

## API 端点

### GET /api/ptp-config

返回 PTP 配置文件的内容

响应格式：
```json
{
    "content": "配置文件内容"
}
```

## 注意事项

- 确保运行服务的用户有权限读取 `/etc/linuxptp/ptp4l.conf` 文件
- 在生产环境中，建议配置具体的 CORS 允许域名，而不是使用 "*" 