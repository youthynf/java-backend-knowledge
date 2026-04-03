#!/usr/bin/env python3
"""
Java 后端面试知识库 - 每日复习推送
随机选择一个知识点发送到飞书群
"""

import os
import random
import requests
from pathlib import Path
from datetime import datetime


def get_all_markdown_files() -> list[Path]:
    """获取所有知识点 markdown 文件"""
    docs_dir = Path(__file__).parent.parent / "docs"
    return list(docs_dir.rglob("*.md"))


def extract_title(file_path: Path) -> str:
    """从文件中提取标题"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if line.startswith('# '):
                    return line[2:].strip()
    except:
        pass
    return file_path.stem


def extract_content(file_path: Path, max_length: int = 4000) -> str:
    """提取文件内容，限制长度"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 移除过多的空行
        while '\n\n\n' in content:
            content = content.replace('\n\n\n', '\n\n')
        
        if len(content) > max_length:
            content = content[:max_length] + "\n\n... (内容过长，请查看完整文档)"
        
        return content
    except Exception as e:
        return f"读取文件失败: {e}"


def get_topic_category(file_path: Path) -> str:
    """获取知识点所属分类"""
    parts = file_path.parts
    try:
        docs_index = parts.index("docs")
        category_dir = parts[docs_index + 1]
        
        category_map = {
            "01-java-core": "☕ Java 核心",
            "02-frameworks": "🔧 框架",
            "03-database": "🗄️ 数据库",
            "04-mq": "📨 消息队列",
            "05-distributed": "🌐 分布式",
            "06-microservice": "☁️ 微服务",
            "07-architecture": "🏗️ 架构",
            "08-network": "🔌 网络",
            "09-algorithm": "🧮 算法"
        }
        return category_map.get(category_dir, "📚 知识点")
    except:
        return "📚 知识点"


def send_to_feishu(content: str, title: str, category: str) -> bool:
    """发送消息到飞书"""
    webhook_url = os.environ.get("FEISHU_WEBHOOK_URL")
    if not webhook_url:
        print("❌ 未配置 FEISHU_WEBHOOK_URL")
        return False
    
    # 添加醒目的复习提示
    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    review_banner = f"🔔 **今日知识点复习** 🔔\n⏰ {now}\n\n---\n\n"
    full_content = review_banner + content
    
    payload = {
        "msg_type": "interactive",
        "card": {
            "header": {
                "title": {
                    "tag": "plain_text",
                    "content": f"📚 {title}"
                },
                "template": "purple"  # 紫色更显眼
            },
            "elements": [
                {
                    "tag": "div",
                    "text": {
                        "tag": "lark_md",
                        "content": f"**{category}**"
                    }
                },
                {
                    "tag": "divider"
                },
                {
                    "tag": "markdown",
                    "content": full_content
                },
                {
                    "tag": "divider"
                },
                {
                    "tag": "note",
                    "elements": [
                        {
                            "tag": "plain_text",
                            "content": "💡 每日复习，巩固记忆 | Java 后端面试知识库"
                        }
                    ]
                }
            ]
        }
    }
    
    try:
        response = requests.post(webhook_url, json=payload, timeout=10)
        response.raise_for_status()
        result = response.json()
        if result.get("StatusCode") == 0:
            print(f"✅ 发送成功: {title}")
            return True
        else:
            print(f"❌ 发送失败: {result}")
            return False
    except Exception as e:
        print(f"❌ 发送异常: {e}")
        return False


def main():
    """主函数"""
    print("📖 开始准备知识点复习...")
    
    # 获取所有知识点文件
    files = get_all_markdown_files()
    if not files:
        print("❌ 未找到知识点文件")
        return
    
    print(f"📚 共找到 {len(files)} 个知识点文件")
    
    # 随机选择一个
    selected_file = random.choice(files)
    title = extract_title(selected_file)
    category = get_topic_category(selected_file)
    content = extract_content(selected_file)
    
    print(f"📝 选中: {title} ({selected_file.relative_to(selected_file.parent.parent.parent)})")
    
    # 发送到飞书
    send_to_feishu(content, title, category)


if __name__ == "__main__":
    main()
