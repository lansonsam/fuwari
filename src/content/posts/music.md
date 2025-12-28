---
title: 终端里看 QQ 音乐歌词，摸鱼神器
published: 2025-12-29
description: 写代码的时候终于能看歌词了
tags:
  - Python
  - CLI
  - 摸鱼
category: 折腾
---

# 起因

作为一名当代大学生，写代码的时候没 BGM 简直写不出 Bug（误）。但是，每次想看歌词还得切屏到 QQ 音乐，这也太打断思路了。而且在实验室或者课堂上，频繁切屏显得我很不专心。

反正天天盯着终端，干脆把歌词塞进去得了。要能**实时滚动**、**高亮当前行**，最好还能自动识别正在放什么歌，不用手动输入。

# 思路

说白了就三件事：

1. **读播放状态**：用 `winsdk` 读 Windows 的 SMTC（系统媒体控制），QQ 音乐在放什么歌、放到哪了，系统都知道
2. **拉歌词**：拿歌名去 `api.vkeys.cn` 查，把 LRC 歌词搞下来
3. **终端里画**：ANSI 转义序列控制光标和颜色，不用清屏也能滚动刷新

> [!WARNING]
> 只能在 Windows 10/11 上跑，Mac 和 Linux 的媒体接口不一样，懒得适配了

# 装依赖

`winsdk` 不是自带的，得装一下：

```bash
pip install winsdk requests
```


```Python
import asyncio
import winsdk.windows.media.control as media_control
import requests
import json
import time
import re
import os
import sys

class SmoothLyrics:
    def __init__(self):
        self.api_base = "[https://api.vkeys.cn/v2/music/tencent](https://api.vkeys.cn/v2/music/tencent)"
        self.current_song = None
        self.lyrics = []
        self.current_lyric_index = -1
        self.last_position = -1
        self.loading = False
        self.last_status = -1  # 缓存上次状态
        self.status_line = 17  # 状态显示行号
        
        # Windows 控制台优化，开启 VT100 模式
        if sys.platform == "win32":
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
    
    def move_cursor(self, x, y):
        """移动光标到指定位置，指哪打哪"""
        print(f"\033[{y};{x}H", end='')
    
    def clear_line(self):
        """清除当前行，保持界面干净"""
        print("\033[K", end='')
    
    def search_song(self, title, artist):
        """去 API 搜一下这首歌的 ID"""
        url = f"{self.api_base}/search/song"
        params = {"word": f"{title} {artist}"}
        
        try:
            response = requests.get(url, params=params, timeout=5)
            data = response.json()
            
            if data["code"] == 200 and data["data"]:
                for song in data["data"]:
                    singers = " ".join([s["name"] for s in song.get("singer_list", [])])
                    # 简单的模糊匹配
                    if song["song"] == title and artist in singers:
                        return song["id"]
                return data["data"][0]["id"]
        except:
            pass
        return None
    
    def get_lyrics(self, song_id):
        """拿着 ID 换歌词"""
        url = f"{self.api_base}/lyric"
        params = {"id": song_id}
        
        try:
            response = requests.get(url, params=params, timeout=5)
            data = response.json()
            
            if data["code"] == 200 and data["data"]:
                return self.parse_lrc(data["data"].get("lrc", ""))
        except:
            pass
        return []
    
    def parse_lrc(self, lrc_text):
        """解析 LRC 格式，正则表达式立大功"""
        lines = lrc_text.split('\n')
        lyrics = []
        
        for line in lines:
            if any(line.startswith(x) for x in ['[ti:', '[ar:', '[al:', '[by:']):
                continue
            
            pattern = r'\[(\d{2}):(\d{2}\.\d{2})\](.*)'
            match = re.match(pattern, line)
            
            if match:
                minutes = int(match.group(1))
                seconds = float(match.group(2))
                text = match.group(3).strip()
                total_seconds = minutes * 60 + seconds
                
                if text:
                    lyrics.append({'time': total_seconds, 'text': text})
        
        return sorted(lyrics, key=lambda x: x['time'])
    
    async def get_current_media_info(self):
        """核心黑科技：从 Windows 获取当前播放信息"""
        try:
            sessions = await media_control.GlobalSystemMediaTransportControlsSessionManager.request_async()
            current_session = sessions.get_current_session()
            
            # 这里锁定了 QQMusic.exe，其他播放器改改也能用
            if current_session and "QQMusic" in current_session.source_app_user_model_id:
                info = await current_session.try_get_media_properties_async()
                playback = current_session.get_playback_info()
                timeline = current_session.get_timeline_properties()
                position = timeline.position.total_seconds() if timeline else 0
                
                return {
                    "title": info.title,
                    "artist": info.artist,
                    "album": info.album_title,
                    "status": playback.playback_status,
                    "position": position
                }
        except:
            pass
        return None
    
    def find_current_lyric(self, position):
        """二分太麻烦，直接倒序遍历找当前歌词"""
        if not self.lyrics: return -1
        for i in range(len(self.lyrics) - 1, -1, -1):
            if self.lyrics[i]['time'] <= position:
                return i
        return 0
    
    def update_lyrics_display(self, current_index):
        """渲染 UI，高亮当前行"""
        if not self.lyrics:
            self.move_cursor(1, 10)
            self.clear_line()
            print("正在加载歌词..." if self.loading else "暂无歌词")
            return
        
        # 显示7行歌词（当前行前后各3行）
        display_lines = 7
        center = display_lines // 2
        start_index = max(0, current_index - center)
        end_index = min(len(self.lyrics), start_index + display_lines)
        
        if end_index - start_index < display_lines:
            start_index = max(0, end_index - display_lines)
        
        for i, line_idx in enumerate(range(start_index, end_index)):
            self.move_cursor(1, 9 + i)
            self.clear_line()
            
            if line_idx < len(self.lyrics):
                text = self.lyrics[line_idx]['text']
                if line_idx == current_index:
                    # 高亮绿色，加箭头
                    print(f"\033[1;32m▶ {text} ◀\033[0m")
                else:
                    # 其他行根据距离变灰
                    distance = abs(line_idx - current_index)
                    color = "\033[0;37m" if distance == 1 else "\033[0;90m"
                    print(f"{color}  {text}\033[0m")
    
    async def run(self):
        """主循环"""
        self.init_display()
        lyrics_task = None
        
        while True:
            try:
                media_info = await self.get_current_media_info()
                
                if media_info and media_info["status"] == 4:  # 4 代表 Playing
                    # 切歌检测
                    if (not self.current_song or 
                        self.current_song["title"] != media_info["title"]):
                        
                        self.current_song = media_info
                        self.lyrics = []
                        self.update_song_info(media_info)
                        
                        # 异步去抓歌词，不阻塞 UI
                        if lyrics_task: lyrics_task.cancel()
                        lyrics_task = asyncio.create_task(
                            self.load_lyrics_async(media_info["title"], media_info["artist"])
                        )
                    
                    # 更新进度条时间
                    if abs(media_info["position"] - self.last_position) >= 1:
                        self.update_position(media_info["position"])
                        self.last_position = media_info["position"]
                    
                    # 刷新歌词
                    if self.lyrics:
                        new_index = self.find_current_lyric(media_info["position"])
                        if new_index != self.current_lyric_index:
                            self.current_lyric_index = new_index
                            self.update_lyrics_display(self.current_lyric_index)

                else:
                    self.move_cursor(1, 10)
                    print("等待 QQ音乐 播放...")

                await asyncio.sleep(0.1) # 0.1秒刷新率，极低占用
                
            except KeyboardInterrupt:
                print("\033[20;1H\n已退出，继续搬砖吧")
                break
            except Exception:
                await asyncio.sleep(1)

    def init_display(self):
        print("\033[2J\033[H", end='') # 清屏
        print("♪ QQ音乐实时歌词 - 摸鱼版 ♪")
        print("=" * 60)
        print("\n" * 15)

    def update_song_info(self, media_info):
        self.move_cursor(1, 4); self.clear_line()
        print(f"歌曲: {media_info['title']} - {media_info['artist']}")
        self.move_cursor(1, 5); self.clear_line()
        print(f"专辑: {media_info['album']}")

    def update_position(self, position):
        self.move_cursor(1, 6); self.clear_line()
        mins, secs = divmod(position, 60)
        print(f"时间: {int(mins):02d}:{int(secs):02d}")

    async def load_lyrics_async(self, title, artist):
        self.loading = True
        song_id = self.search_song(title, artist)
        if song_id: self.lyrics = self.get_lyrics(song_id)
        self.loading = False

if __name__ == "__main__":
    print("\033[?25l", end='') # 隐藏光标
    try:
        player = SmoothLyrics()
        asyncio.run(player.run())
    finally:
        print("\033[?25h", end='') # 恢复光标
```