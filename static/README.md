# PTP配置器前端

## 概述

这是PTP配置器的前端界面，提供了直观的Web界面来管理和监控PTP系统同步配置。

## 功能特性

### 1. 系统同步管理
- **同步方式设置**: 支持内同步、BB、PTP三种模式
- **实时状态监控**: 显示当前同步方式、时钟锁定状态、时钟源等信息
- **自动服务控制**: 根据同步方式自动启停phc2sys服务

### 2. PTP时钟配置
- **网络接口配置**: 支持多选网络接口
- **PTP参数设置**: 
  - PTP Domain
  - Priority1/Priority2
  - Announce Interval
  - Sync Interval
  - 超时设置等
- **实时状态显示**: 端口状态、锁定状态、GMID、链路延时、时间偏差等

### 3. 界面特性
- **响应式设计**: 支持桌面和移动设备
- **实时更新**: 每5秒自动更新状态信息
- **用户友好**: 加载提示、消息反馈、错误处理
- **现代化UI**: 渐变背景、卡片布局、动画效果

## 文件结构

```
static/
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式文件
├── js/
│   └── app.js          # JavaScript逻辑
└── README.md           # 本文件
```

## 使用方法

1. **启动后端服务**:
   ```bash
   python main.py
   ```

2. **访问前端界面**:
   打开浏览器访问 `http://localhost:8001`

3. **配置系统同步**:
   - 选择同步方式（内同步/BB/PTP）
   - 点击"提交"按钮应用设置

4. **配置PTP时钟**:
   - 选择网络接口
   - 设置PTP参数
   - 点击"提交"按钮应用配置

## API接口

前端使用以下后端API接口：

- `GET /api/clock-sync-mode` - 获取同步方式
- `PUT /api/clock-sync-mode` - 设置同步方式
- `GET /api/network-interfaces` - 获取网络接口
- `GET /api/ptp-config` - 获取PTP配置
- `PUT /api/ptp-config` - 更新PTP配置
- `PUT /api/ptp4l-service-interface` - 更新网络接口配置
- `GET /api/ptp-timestatus` - 获取时间状态
- `GET /api/ptp-port-status` - 获取端口状态
- `GET /api/ptp-currenttimedata` - 获取当前时间数据

## 浏览器兼容性

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 开发说明

### 修改样式
编辑 `css/style.css` 文件来修改界面样式。

### 修改逻辑
编辑 `js/app.js` 文件来修改前端逻辑。

### 添加新功能
1. 在HTML中添加新的UI元素
2. 在CSS中添加相应的样式
3. 在JavaScript中添加相应的逻辑和API调用

## 故障排除

### 页面无法加载
- 检查后端服务是否正常运行
- 确认端口8001是否可访问
- 检查浏览器控制台是否有错误信息

### API调用失败
- 检查网络连接
- 确认后端API是否正常响应
- 查看浏览器控制台的错误信息

### 样式显示异常
- 清除浏览器缓存
- 检查CSS文件是否正确加载
- 确认浏览器兼容性 