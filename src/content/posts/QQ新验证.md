---
title: QQ 扫码登录逆向分析，从抓包到算法还原
published: 2025-12-29
description: 研究了一个周末，终于搞明白腾讯是怎么做扫码登录的了
tags:
- Python
- 逆向
- QQ
- 抓包
category: 折腾
---


## 一、研究背景

### 1.1 为啥要研究这个

主要是好奇吧，每天都在用 QQ，但是从来没想过扫码登录背后是怎么实现的。而且网上关于这块的资料要么太老了，要么讲得不清楚，干脆自己抓包分析一下。

### 1.2 分析工具

- Chrome 开发者工具（F12 大法好）
- Fiddler 抓包
- Python + requests 验证

---

## 二、QQ 扫码登录整体流程

先上一张整体流程图，有个大概印象：

```
┌──────────────────────────────────────────────────────────────────┐
│                      QQ 扫码登录完整流程                          │
└──────────────────────────────────────────────────────────────────┘

┌─────────────┐
│  开始登录   │
└──────┬──────┘
       │
       v
┌─────────────────────────────────────┐
│  Step 1: 访问 xlogin 页面            │
│  URL: xui.ptlogin2.qq.com/xlogin    │
│  目的: 获取 pt_login_sig Cookie      │
└──────────────────┬──────────────────┘
                   │
                   v
┌─────────────────────────────────────┐
│  Step 2: 请求二维码                  │
│  URL: ssl.ptlogin2.qq.com/ptqrshow  │
│  返回: 二维码图片 + qrsig Cookie     │
└──────────────────┬──────────────────┘
                   │
                   v
┌─────────────────────────────────────┐
│  Step 3: 计算 ptqrtoken              │
│  算法: hash(qrsig)                   │
│  用于: 后续轮询请求的签名             │
└──────────────────┬──────────────────┘
                   │
                   v
┌─────────────────────────────────────┐
│  Step 4: 轮询扫码状态                │
│  URL: ssl.ptlogin2.qq.com/ptqrlogin │
│  返回: 状态码 + 跳转URL              │
└──────────────────┬──────────────────┘
                   │
       ┌───────────┼───────────┐
       │           │           │
       v           v           v
   ┌───────┐  ┌────────┐  ┌────────┐
   │ 成功  │  │ 等待中 │  │ 已失效 │
   │ (0)   │  │(65/66) │  │(10009) │
   └───┬───┘  └────┬───┘  └────────┘
       │           │
       │           └──> 继续轮询
       v
┌─────────────────────────────────────┐
│  Step 5: 访问跳转 URL                │
│  目的: 获取 skey, p_skey 等 Cookie   │
└──────────────────┬──────────────────┘
                   │
                   v
┌─────────────────────────────────────┐
│  Step 6: 计算 g_tk (bkn)             │
│  算法: hash(skey)                    │
│  用于: 后续业务接口的鉴权             │
└──────────────────┬──────────────────┘
                   │
                   v
┌─────────────┐
│  登录完成   │
└─────────────┘
```

整个流程看起来不复杂，但是每一步都有坑，下面一个一个说。

---

## 三、Step 1：初始化登录环境

### 3.1 请求分析

首先要访问腾讯的 xlogin 页面：

```
GET https://xui.ptlogin2.qq.com/cgi-bin/xlogin
```

请求参数：

| 参数 | 示例值 | 说明 |
|------|--------|------|
| appid | 715030901 | 应用ID，不同业务不一样 |
| daid | 73 | 域ID，和 appid 配套 |
| s | 8 | 固定值 |
| pt_3rd_aid | 0 | 第三方应用ID |

### 3.2 appid 对照表

不同的 QQ 业务有不同的 appid，这个是抓包抓出来的：

| 业务 | appid | daid |
|------|-------|------|
| QQ群管理 | 715030901 | 73 |
| QQ空间 | 549000912 | 5 |
| QQ邮箱 | 522005705 | 4 |
| 腾讯文档 | 1006102 | 461 |

用错 appid 会导致后面拿到的 Cookie 在对应业务上用不了，这个坑我踩过。

### 3.3 响应分析

这个请求主要是为了在 Cookie 里设置 `pt_login_sig`，后面轮询的时候要用。

```
Set-Cookie: pt_login_sig=xxxxxx; Domain=.qq.com; Path=/
```

---

## 四、Step 2：获取二维码

### 4.1 请求分析

```
GET https://ssl.ptlogin2.qq.com/ptqrshow
```

请求参数：

| 参数 | 示例值 | 说明 |
|------|--------|------|
| appid | 715030901 | 应用ID |
| e | 2 | 二维码类型 |
| l | M | 二维码大小（M=中等） |
| s | 3 | 样式 |
| d | 72 | 边距像素 |
| v | 4 | 版本 |
| t | 1703123456.789 | 时间戳，防缓存 |
| daid | 73 | 域ID |
| pt_3rd_aid | 0 | 第三方应用ID |

### 4.2 响应分析

响应体是二维码的 PNG 图片数据，同时在 Cookie 里设置 `qrsig`：

```
Set-Cookie: qrsig=xxxxxx; Domain=.qq.com; Path=/
```

这个 `qrsig` 非常重要，是后面计算 `ptqrtoken` 的关键。

### 4.3 二维码内容

扫描二维码会得到一个 URL，格式大概是：

```
https://ssl.ptlogin2.qq.com/ptqrlogin?xxx
```

手机 QQ 扫描后会访问这个 URL 完成授权。

---

## 五、Step 3：ptqrtoken 算法分析

### 5.1 算法来源

这个算法是从腾讯的 JS 代码里扒出来的。打开浏览器开发者工具，在 Sources 面板搜索 `ptqrtoken`，能找到这段代码：

```javascript
function getptqrtoken(qrsig) {
    var e = 0;
    for (var i = 0; i < qrsig.length; i++) {
        e += (e << 5) + qrsig.charCodeAt(i);
    }
    return e & 2147483647;
}
```

### 5.2 算法解析

用 Python 实现就是：

```python
def get_ptqrtoken(qrsig: str) -> int:
    hash_val = 0
    for char in qrsig:
        hash_val += (hash_val << 5) + ord(char)
    return hash_val & 2147483647
```

逐步分析：

1. 初始化 `hash_val = 0`
2. 遍历 qrsig 的每个字符
3. `hash_val << 5` 等价于 `hash_val * 32`
4. 加上当前字符的 ASCII 码值
5. 最后和 `0x7FFFFFFF`（2147483647）做与运算

### 5.3 为什么要做与运算

`& 2147483647` 的作用是：

1. 保证结果是正整数（去掉符号位）
2. 限制结果在 32 位整数范围内
3. 防止溢出

### 5.4 计算示例

假设 qrsig = "abc"：

```
初始: hash_val = 0

第1轮 (char = 'a', ASCII = 97):
  hash_val = 0 + (0 << 5) + 97 = 97

第2轮 (char = 'b', ASCII = 98):
  hash_val = 97 + (97 << 5) + 98 = 97 + 3104 + 98 = 3299

第3轮 (char = 'c', ASCII = 99):
  hash_val = 3299 + (3299 << 5) + 99 = 3299 + 105568 + 99 = 108966

最终: 108966 & 2147483647 = 108966
```

---

## 六、Step 4：轮询扫码状态

### 6.1 请求分析

```
GET https://ssl.ptlogin2.qq.com/ptqrlogin
```

这个接口参数巨多，我整理了一下：

| 参数 | 示例值 | 说明 |
|------|--------|------|
| u1 | https://qun.qq.com/member.html | 登录成功后跳转地址 |
| ptqrtoken | 123456789 | 上一步算出来的 |
| ptredirect | 0 | 固定值 |
| h | 1 | 固定值 |
| t | 1 | 固定值 |
| g | 1 | 固定值 |
| from_ui | 1 | 固定值 |
| ptlang | 2052 | 语言代码，2052=简体中文 |
| action | 0-0-1703123456789 | 格式: 0-0-毫秒时间戳 |
| js_ver | 24051615 | JS版本号，会变 |
| js_type | 1 | 固定值 |
| login_sig | xxx | 从 Cookie 获取 |
| pt_uistyle | 40 | UI样式 |
| aid | 715030901 | appid |
| daid | 73 | 域ID |

### 6.2 响应格式

响应是 JSONP 格式：

```javascript
ptuiCB('状态码','0','跳转URL','0','提示信息','昵称')
```

### 6.3 状态码对照表

| 状态码 | 含义 | 处理方式 |
|--------|------|----------|
| 0 | 登录成功 | 提取跳转URL，进入下一步 |
| 65 | 已扫描，待确认 | 继续轮询 |
| 66 | 二维码未失效 | 继续轮询 |
| 67 | 等待扫描 | 继续轮询 |
| 10009 | 二维码已失效 | 重新获取二维码 |
| 10006 | 二维码已失效 | 重新获取二维码 |

### 6.4 响应示例

等待扫描：
```javascript
ptuiCB('67','0','','0','二维码未失效。','')
```

已扫描待确认：
```javascript
ptuiCB('65','0','','0','二维码已扫描，请在手机上确认登录。','张三')
```

登录成功：
```javascript
ptuiCB('0','0','https://ssl.ptlogin2.qq.com/check_sig?pttype=1&uin=123456789&service=...','0','登录成功！','张三')
```

### 6.5 提取跳转 URL

登录成功后需要用正则提取跳转 URL：

```python
import re
match = re.search(r"ptuiCB\('0','0','([^']+)','0'", response_text)
if match:
    redirect_url = match.group(1)
```

---

## 七、Step 5：获取关键 Cookie

### 7.1 请求分析

访问上一步拿到的跳转 URL：

```
GET https://ssl.ptlogin2.qq.com/check_sig?pttype=1&uin=xxx&service=xxx...
```

这个请求会经过多次 302 重定向。

### 7.2 重定向链路

```
ssl.ptlogin2.qq.com/check_sig
    │
    └──> ptlogin2.qun.qq.com/check_sig_v3
              │
              └──> qun.qq.com/member.html (最终页面)
```

### 7.3 获取的 Cookie

在重定向过程中，会设置以下关键 Cookie：

| Cookie | 域 | 说明 |
|--------|-----|------|
| skey | .qq.com | 最重要，算 g_tk 要用 |
| p_skey | .qun.qq.com | 某些接口需要 |
| pt4_token | .qq.com | 某些接口需要 |
| uin | .qq.com | 用户QQ号 |

### 7.4 注意事项

1. 必须设置正确的 Referer：`https://ssl.ptlogin2.qq.com/`
2. 要允许自动重定向（`allow_redirects=True`）
3. 要用 Session 保持 Cookie

---

## 八、Step 6：g_tk (bkn) 算法分析

### 8.1 算法来源

同样是从腾讯 JS 里扒的，搜索 `getACSRFToken` 或 `g_tk`：

```javascript
function getACSRFToken(skey) {
    var hash = 5381;
    for (var i = 0; i < skey.length; i++) {
        hash += (hash << 5) + skey.charCodeAt(i);
    }
    return hash & 2147483647;
}
```

### 8.2 算法解析

Python 实现：

```python
def get_g_tk(skey: str) -> int:
    hash_val = 5381
    for char in skey:
        hash_val += (hash_val << 5) + ord(char)
    return hash_val & 2147483647
```

### 8.3 和 ptqrtoken 的区别

| | ptqrtoken | g_tk |
|---|-----------|------|
| 输入 | qrsig | skey |
| 初始值 | 0 | 5381 |
| 算法 | 相同 | 相同 |

唯一的区别就是初始值，ptqrtoken 是 0，g_tk 是 5381。

### 8.4 为什么是 5381

5381 是 DJB2 哈希算法的魔数，这个算法是 Daniel J. Bernstein 发明的。选择 5381 的原因据说是：

1. 5381 是质数
2. 实验证明这个值的哈希分布效果好

反正腾讯用的就是这个，别问为什么，问就是玄学。

### 8.5 计算示例

假设 skey = "@abc"：

```
初始: hash_val = 5381

第1轮 (char = '@', ASCII = 64):
  hash_val = 5381 + (5381 << 5) + 64
           = 5381 + 172192 + 64
           = 177637

第2轮 (char = 'a', ASCII = 97):
  hash_val = 177637 + (177637 << 5) + 97
           = 177637 + 5684384 + 97
           = 5862118

... 以此类推
```

---

## 九、完整时序图

```
┌────────┐          ┌────────────────┐          ┌────────────────┐
│ Client │          │  QQ Login API  │          │   QQ Mobile    │
└───┬────┘          └───────┬────────┘          └───────┬────────┘
    │                       │                           │
    │  GET /xlogin          │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  Set-Cookie:          │                           │
    │  pt_login_sig         │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │  GET /ptqrshow        │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  二维码图片 +          │                           │
    │  Set-Cookie: qrsig    │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │  计算 ptqrtoken        │                           │
    │  = hash(qrsig)        │                           │
    │                       │                           │
    │  GET /ptqrlogin       │                           │
    │  (轮询)               │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  ptuiCB('67'...)      │                           │
    │  等待扫描              │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │                       │      用户扫码              │
    │                       │<──────────────────────────│
    │                       │                           │
    │  GET /ptqrlogin       │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  ptuiCB('65'...)      │                           │
    │  已扫描待确认          │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │                       │      用户确认              │
    │                       │<──────────────────────────│
    │                       │                           │
    │  GET /ptqrlogin       │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  ptuiCB('0'...)       │                           │
    │  登录成功 + 跳转URL    │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │  GET /check_sig       │                           │
    │  (跳转URL)            │                           │
    │──────────────────────>│                           │
    │                       │                           │
    │  302 重定向            │                           │
    │  Set-Cookie:          │                           │
    │  skey, p_skey...      │                           │
    │<──────────────────────│                           │
    │                       │                           │
    │  计算 g_tk             │                           │
    │  = hash(skey)         │                           │
    │                       │                           │
    │  登录完成，可调用      │                           │
    │  业务接口              │                           │
    │                       │                           │
```

---

## 十、踩坑记录

### 10.1 js_ver 过期

腾讯会不定期更新 JS 版本号，如果发现登录突然失败，可以试试更新 `js_ver` 参数。

获取方法：打开 QQ 登录页面，在 Network 里找 ptqrlogin 请求，看它带的 js_ver 是多少。

### 10.2 Referer 检查

腾讯对 Referer 检查很严格，每个请求都要设置正确的 Referer，不然会返回错误。

| 请求 | Referer |
|------|---------|
| ptqrshow | https://xui.ptlogin2.qq.com/ |
| ptqrlogin | https://xui.ptlogin2.qq.com/ |
| check_sig | https://ssl.ptlogin2.qq.com/ |

### 10.3 Cookie 丢失

必须用 Session 保持 Cookie，不能每次请求都新建连接。

```python
# 错误做法
requests.get(url1)
requests.get(url2)  # Cookie 丢了

# 正确做法
session = requests.Session()
session.get(url1)
session.get(url2)  # Cookie 自动带上
```

### 10.4 时间戳精度

action 参数要用毫秒级时间戳：

```python
# 错误
action = f"0-0-{int(time.time())}"  # 秒级，会失败

# 正确
action = f"0-0-{int(time.time() * 1000)}"  # 毫秒级
```

### 10.5 User-Agent

用默认的 Python UA 可能会被拦截，建议伪装成浏览器：

```python
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ..."
}
```

---

## 十一、总结

QQ 扫码登录的核心就两个算法：

1. **ptqrtoken**：用 qrsig 算，初始值 0
2. **g_tk/bkn**：用 skey 算，初始值 5381

两个算法本质上是一样的，都是 DJB2 哈希的变种，只是初始值不同。

整个流程说白了就是：

1. 拿二维码和 qrsig
2. 算 ptqrtoken，轮询等用户扫码
3. 扫码成功拿跳转 URL
4. 访问跳转 URL 拿 skey
5. 用 skey 算 g_tk，完事儿

腾讯的接口没有文档，全靠抓包分析，而且随时可能更新。如果哪天突然不能用了，大概率是腾讯又改接口了，重新抓包分析吧。

---

> 研究这玩意花了我一个周末，期间无数次想砸电脑。
>
> 不过搞明白之后还是挺有成就感的，至少知道了每天用的 QQ 背后是怎么运作的。
>
> 希望这篇分析能帮到同样在研究这块的兄弟们，少走点弯路。
>
> 就这样，我继续去听歌摸鱼了。
