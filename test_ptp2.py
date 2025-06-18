#!/usr/bin/env python3
"""
PTP时钟2功能测试脚本
"""

import requests
import json
import time

BASE_URL = "http://localhost:8001"

def test_ptp2_config():
    """测试PTP时钟2配置API"""
    print("=== 测试PTP时钟2配置API ===")
    
    # 获取PTP时钟2配置
    try:
        response = requests.get(f"{BASE_URL}/api/ptp-config?config_file=/etc/linuxptp/ptp4l1.conf")
        if response.status_code == 200:
            data = response.json()
            print("✓ 获取PTP时钟2配置成功")
            print(f"  Domain: {data.get('config', {}).get('domain', 'N/A')}")
            print(f"  Priority1: {data.get('config', {}).get('priority1', 'N/A')}")
            print(f"  Priority2: {data.get('config', {}).get('priority2', 'N/A')}")
        else:
            print(f"✗ 获取PTP时钟2配置失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取PTP时钟2配置异常: {e}")

def test_ptp2_port_status():
    """测试PTP时钟2端口状态API"""
    print("\n=== 测试PTP时钟2端口状态API ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/ptp-port-status?uds_path=/var/run/ptp4l1")
        if response.status_code == 200:
            data = response.json()
            print("✓ 获取PTP时钟2端口状态成功")
            print(f"  Port State: {data.get('port_state', 'N/A')}")
            print(f"  Port Identity: {data.get('port_identity', 'N/A')}")
        else:
            print(f"✗ 获取PTP时钟2端口状态失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取PTP时钟2端口状态异常: {e}")

def test_ptp2_time_data():
    """测试PTP时钟2时间数据API"""
    print("\n=== 测试PTP时钟2时间数据API ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/ptp-currenttimedata?uds_path=/var/run/ptp4l1")
        if response.status_code == 200:
            data = response.json()
            print("✓ 获取PTP时钟2时间数据成功")
            print(f"  Offset from Master: {data.get('offset_from_master', 'N/A')}")
            print(f"  Mean Path Delay: {data.get('mean_path_delay', 'N/A')}")
            print(f"  Steps Removed: {data.get('steps_removed', 'N/A')}")
        else:
            print(f"✗ 获取PTP时钟2时间数据失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取PTP时钟2时间数据异常: {e}")

def test_ptp2_config_update():
    """测试PTP时钟2配置更新API"""
    print("\n=== 测试PTP时钟2配置更新API ===")
    
    # 测试配置更新
    test_config = {
        "config_file": "/etc/linuxptp/ptp4l1.conf",
        "domain": 128,
        "priority1": 129,
        "priority2": 129,
        "logAnnounceInterval": 1,
        "announceReceiptTimeout": 7,
        "logSyncInterval": -2,
        "syncReceiptTimeout": 7,
        "interfaces": ["eth0"]
    }
    
    try:
        response = requests.put(
            f"{BASE_URL}/api/ptp-config",
            headers={"Content-Type": "application/json"},
            data=json.dumps(test_config)
        )
        if response.status_code == 200:
            data = response.json()
            if data.get('success'):
                print("✓ PTP时钟2配置更新成功")
            else:
                print(f"✗ PTP时钟2配置更新失败: {data.get('error', 'Unknown error')}")
        else:
            print(f"✗ PTP时钟2配置更新HTTP错误: {response.status_code}")
    except Exception as e:
        print(f"✗ PTP时钟2配置更新异常: {e}")

def test_network_interfaces():
    """测试网络接口API"""
    print("\n=== 测试网络接口API ===")
    
    try:
        response = requests.get(f"{BASE_URL}/api/network-interfaces")
        if response.status_code == 200:
            data = response.json()
            print("✓ 获取网络接口成功")
            print(f"  可用接口: {data.get('interfaces', [])}")
        else:
            print(f"✗ 获取网络接口失败: {response.status_code}")
    except Exception as e:
        print(f"✗ 获取网络接口异常: {e}")

def main():
    """主测试函数"""
    print("开始PTP时钟2功能测试...")
    print("=" * 50)
    
    # 测试网络接口
    test_network_interfaces()
    
    # 测试PTP时钟2配置
    test_ptp2_config()
    
    # 测试PTP时钟2端口状态
    test_ptp2_port_status()
    
    # 测试PTP时钟2时间数据
    test_ptp2_time_data()
    
    # 测试PTP时钟2配置更新
    test_ptp2_config_update()
    
    print("\n" + "=" * 50)
    print("PTP时钟2功能测试完成!")

if __name__ == "__main__":
    main() 