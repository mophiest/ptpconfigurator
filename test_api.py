import requests
import json

def test_ptp_config():
    try:
        response = requests.get('http://localhost:8001/api/ptp-config')
        response.raise_for_status()  # 检查响应状态
        data = response.json()
        
        print("\n配置文件内容（键值对格式）：")
        print(json.dumps(data, indent=2, ensure_ascii=False))
        
    except requests.exceptions.RequestException as e:
        print(f"请求错误: {e}")
    except Exception as e:
        print(f"其他错误: {e}")

if __name__ == "__main__":
    test_ptp_config() 