from fastapi import FastAPI, Form, File, UploadFile
from fastapi.responses import Response
import requests
import json
import sqlite3
from datetime import datetime
from fastapi.middleware.cors import CORSMiddleware

# ==================== 配置区（务必修改）====================
API_KEY = "sk-d0a10ee6bc0b4305b16a2014904bd986"  # 把这里替换成你自己的密钥
API_URL = "https://api.deepseek.com/v1/chat/completions"
# ===========================================================

app = FastAPI(title="高数AI系统后端")

# 允许小程序跨域访问本地接口
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 初始化数据库，自动创建数据表
def init_db():
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    # 用户表
    c.execute('''CREATE TABLE IF NOT EXISTS user
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  username TEXT UNIQUE,
                  password TEXT,
                  create_time TEXT)''')
    # 学情分析表
    c.execute('''CREATE TABLE IF NOT EXISTS user_profile
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  weak_points TEXT,
                  error_reason TEXT,
                  level TEXT,
                  suggest TEXT,
                  update_time TEXT)''')
    # 学习资源表
    c.execute('''CREATE TABLE IF NOT EXISTS study_resource
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  content TEXT,
                  create_time TEXT)''')
    # 聊天记录表
    c.execute('''CREATE TABLE IF NOT EXISTS chat_log
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  question TEXT,
                  answer TEXT,
                  create_time TEXT)''')
    # 做题记录表
    c.execute('''CREATE TABLE IF NOT EXISTS exercise_record
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  question TEXT,
                  user_answer TEXT,
                  correct INTEGER DEFAULT 0,
                  score INTEGER DEFAULT 0,
                  kp_name TEXT,
                  create_time TEXT)''')
    # 每日学习进度表
    c.execute('''CREATE TABLE IF NOT EXISTS learning_progress
                 (id INTEGER PRIMARY KEY AUTOINCREMENT,
                  user_id INTEGER,
                  date TEXT,
                  study_minutes INTEGER DEFAULT 0,
                  questions_done INTEGER DEFAULT 0,
                  correct_count INTEGER DEFAULT 0,
                  weak_kps TEXT,
                  UNIQUE(user_id, date))''')
    # 用户学习数据同步表
    c.execute('''CREATE TABLE IF NOT EXISTS user_sync
                 (user_id INTEGER PRIMARY KEY,
                  data_json TEXT,
                  update_time TEXT)''')
    conn.commit()
    conn.close()

# 项目启动初始化数据库
init_db()

# ========== 用户注册/登录 ==========
import hashlib

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

@app.post("/api/register")
def register(username: str = Form(...), password: str = Form(...)):
    if len(username) < 2 or len(password) < 6:
        return {"code": 400, "msg": "用户名至少2位，密码至少6位"}
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT id FROM user WHERE username=?", (username,))
    if c.fetchone():
        conn.close()
        return {"code": 400, "msg": "用户名已存在"}
    c.execute("INSERT INTO user (username, password, create_time) VALUES (?, ?, ?)",
              (username, hash_password(password), datetime.now().isoformat()))
    conn.commit()
    user_id = c.lastrowid
    conn.close()
    return {"code": 200, "msg": "注册成功", "data": {"user_id": user_id, "username": username}}

@app.post("/api/login")
def login(username: str = Form(...), password: str = Form(...)):
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT id, username FROM user WHERE username=? AND password=?",
              (username, hash_password(password)))
    row = c.fetchone()
    conn.close()
    if row:
        return {"code": 200, "msg": "登录成功", "data": {"user_id": row[0], "username": row[1]}}
    return {"code": 401, "msg": "用户名或密码错误"}

# ===================== 【新增全局规则：仅修改此处，原代码完全不动】====================
# 允许数学符号、字母、公式；要求讲解详细、步骤清晰、通俗易懂、排版整洁
# ===================== 【修改后的全局规则：只追加，不改动原有代码】====================
# 允许正常数学符号、字母、公式；但禁止输出LaTeX语法（如\int、\frac），只输出纯数学符号
GLOBAL_EXPLAIN_RULE = """
【强制格式要求，逐条遵守】
1.  可以正常使用数学符号、字母、公式，但**禁止输出任何LaTeX语法标记**（如\int、\frac、\cdot、\quad、\boxed、\left、\right等）。
2.  公式直接用纯数学符号书写：
    - ∫(2x+1)dx 代替 \int(2x+1)dx
    - 2x/(x²+1) 代替 \frac{2x}{x²+1}
    - sin(x) 代替 \sin x
    - x² 代替 x^2
3.  解题步骤拆分完整，使用「第一步、第二步、第三步」依次书写，不要跳步。
4.  语言通俗易懂，步骤解释清晰，照顾基础薄弱的学习者。
5.  使用以下标记让重点内容突出显示（仅这几个标记，不用其他）：
    **核心术语** 用于标注定义、定理、公式名称（显示为蓝色加粗）
    ==关键公式== 用于标注重要的数学表达式（显示为蓝底高亮）
    !!易错警告!! 用于标注容易出错的地方（显示为红底高亮）
    __章节标题__ 用于大标题（显示为大号加粗）
    --例题标记-- 用于标注例题（显示为绿色）
"""
# =====================================================================================

# 通用函数：调用DeepSeek大模型
def call_llm(prompt: str) -> str:
    # 拼接全局规则，原有逻辑不变
    full_prompt = GLOBAL_EXPLAIN_RULE + "\n" + prompt
    
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": full_prompt}],
        "temperature": 0.2
    }
    try:
        resp = requests.post(API_URL, headers=headers, json=data, timeout=30)
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"AI调用失败：{str(e)}"

# 数据库写入辅助函数
def save_to_db(table, data):
    try:
        conn = sqlite3.connect("database.db")
        c = conn.cursor()
        cols = ', '.join(data.keys())
        vals = ', '.join(['?'] * len(data))
        c.execute(f"INSERT INTO {table} ({cols}) VALUES ({vals})", list(data.values()))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"DB写入失败({table}):", e)
        return False

# ========== 接口0：多智能体协同（一键诊断→批改→错题本→图谱）==========
@app.post("/api/workflow")
def workflow(wrong_content: str = Form(...), user_id: str = Form("")):
    """用户提交错题 → 4个智能体协同输出完整结果"""
    import concurrent.futures

    # 准备诊断提示词
    diagnosis_prompt = f"""
你是资深高数教师，根据用户错题分析，严格输出JSON格式，不要多余文字。
格式：
{{
  "weak_knowledge": "薄弱知识点",
  "error_type": "错误类型",
  "error_reason": "错误原因",
  "mastery_level": "入门/中等/较好",
  "easy_mistake_points": "高频易错点",
  "study_suggest": "学习建议"
}}
用户错题内容：{wrong_content}
"""

    # 先执行诊断（必须第一步）
    diag_result = call_llm(diagnosis_prompt)
    try:
        diag_data = json.loads(diag_result)
    except:
        return {"code": 500, "msg": "诊断解析失败", "raw": diag_result}

    weak = diag_data.get("weak_knowledge", "")
    level = diag_data.get("mastery_level", "中等")

    # 并行执行：错题本 + 知识图谱 + 习题（基于诊断结果）
    def gen_notebook():
        return call_llm(f"""你是高数教师，根据错题整理错题本。输出：1.错题归类 2.原题+错误分析 3.标准解析 4.2~3道同类变式题 5.复习建议。错题：{wrong_content} 薄弱点：{weak}""")

    def gen_graph():
        return call_llm(f"""你是高数知识图谱专家。解读薄弱知识点{weak}在完整知识体系中的位置。输出：一、定位 二、前置知识 三、关联知识点 四、延伸方向 五、学习顺序建议""")

    def gen_exercises():
        return call_llm(f"""你是高数出题老师。薄弱知识点：{weak}，水平：{level}。禁止LaTeX。输出：1.知识点总结 2.基础题1道+提升题2道，每题附完整解题步骤+答案""")

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        future_notebook = executor.submit(gen_notebook)
        future_graph = executor.submit(gen_graph)
        future_exercise = executor.submit(gen_exercises)
        notebook_content = future_notebook.result()
        graph_content = future_graph.result()
        exercise_content = future_exercise.result()

    # 保存到数据库（所有写入用同一个连接，确保一致）
    sync_data = None
    if user_id:
        conn = sqlite3.connect("database.db")
        c = conn.cursor()
        now = datetime.now().isoformat()
        today = datetime.now().strftime("%Y-%m-%d")
        # 学情分析
        c.execute("INSERT INTO user_profile (user_id, weak_points, error_reason, level, suggest, update_time) VALUES (?,?,?,?,?,?)",
                  (user_id, weak, diag_data.get("error_reason",""), level, diag_data.get("study_suggest",""), now))
        # 错题记录
        c.execute("INSERT INTO exercise_record (user_id, question, correct, kp_name, create_time) VALUES (?,?,0,?,?)",
                  (user_id, wrong_content[:2000], weak, now))
        # 每日进度
        c.execute("SELECT id FROM learning_progress WHERE user_id=? AND date=?", (user_id, today))
        if c.fetchone():
            c.execute("UPDATE learning_progress SET questions_done=questions_done+1 WHERE user_id=? AND date=?", (user_id, today))
        else:
            c.execute("INSERT INTO learning_progress (user_id, date, questions_done) VALUES (?,?,1)", (user_id, today))
        # 云端同步数据
        c.execute("SELECT question FROM exercise_record WHERE user_id=? ORDER BY create_time DESC LIMIT 50", (user_id,))
        all_errors = [r[0][:200] for r in c.fetchall()]
        sync = {"weak_point": weak, "mastery_level": level, "error_list": all_errors}
        c.execute("INSERT OR REPLACE INTO user_sync (user_id, data_json, update_time) VALUES (?,?,?)",
                  (user_id, json.dumps(sync, ensure_ascii=False), now))
        conn.commit()
        conn.close()
        sync_data = sync

    return {
        "code": 200,
        "data": {
            "diagnosis": diag_data,
            "notebook": notebook_content,
            "graph": graph_content,
            "exercises": exercise_content,
            "sync": sync_data if user_id else None
        }
    }

# ========== 接口7：跨设备数据同步 ==========
@app.post("/api/sync/save")
def sync_save(user_id: str = Form(...), data_json: str = Form(...)):
    """保存用户学习数据到云端"""
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO user_sync (user_id, data_json, update_time) VALUES (?, ?, ?)",
              (user_id, data_json, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return {"code": 200, "msg": "同步成功"}

@app.post("/api/sync/load")
def sync_load(user_id: str = Form(...)):
    """加载用户云端学习数据"""
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT data_json FROM user_sync WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return {"code": 200, "data": json.loads(row[0])}
    return {"code": 200, "data": {}}

# ========== 接口8：学习数据查询 ==========
@app.post("/api/progress")
def get_progress(user_id: str = Form("")):
    if not user_id:
        return {"code": 400, "msg": "缺少user_id"}
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    # 做题统计
    c.execute("SELECT COUNT(*), SUM(correct) FROM exercise_record WHERE user_id=?", (user_id,))
    total, correct = c.fetchone()
    total = total or 0
    correct = correct or 0
    # 近7天学习记录
    c.execute("SELECT date, questions_done, study_minutes FROM learning_progress WHERE user_id=? ORDER BY date DESC LIMIT 7", (user_id,))
    daily = [{"date": r[0], "questions": r[1] or 0, "minutes": r[2] or 0} for r in c.fetchall()]
    # 诊断历史
    c.execute("SELECT weak_points, level, update_time FROM user_profile WHERE user_id=? ORDER BY update_time DESC LIMIT 5", (user_id,))
    profiles = [{"weak_points": r[0], "level": r[1], "time": r[2]} for r in c.fetchall()]
    conn.close()
    return {"code": 200, "data": {"total_questions": total, "correct_count": correct, "accuracy": round(correct*100/max(total,1), 1), "daily": daily, "profiles": profiles}}

# ========== 接口1：学情分析智能体（智能体1）==========
@app.post("/api/analysis")
def analysis(wrong_content: str = Form(...)):
    prompt = f"""
你是资深高数教师，根据用户错题分析，严格输出JSON格式，不要多余文字。
格式：
{{
  "weak_knowledge": "薄弱知识点",
  "error_reason": "错误原因",
  "mastery_level": "入门/中等/较好",
  "suggest": "简短学习建议"
}}
用户错题内容：{wrong_content}
"""
    ai_res = call_llm(prompt)
    try:
        data = json.loads(ai_res)
        return {"code": 200, "data": data}
    except:
        return {"code": 500, "msg": "解析失败", "raw": ai_res}

# ========== 接口2：学习资源生成智能体（智能体2）==========
@app.post("/api/generate")
def generate(weak: str = Form(""), level: str = Form(""), prompt: str = Form(""), user_id: str = Form("")):
    if prompt:
        # 前端传入自定义 prompt（如学习规划智能体），直接使用
        ai_prompt = prompt
    else:
        # 默认：知识点总结 + 出题模式
        ai_prompt = f"""
你是高数出题老师，用户薄弱知识点：{weak}，掌握水平：{level}。
**重要：禁止使用任何LaTeX语法（如\int、\frac、\cdot），直接用∫、÷、²等纯数学符号书写。**
输出两部分内容：
1. 精简版知识点总结
2. 出3道习题：1道基础题、2道提升题，每题附带完整解题步骤+答案
排版清晰，数学公式书写规范。
"""
    content = call_llm(ai_prompt)
    if user_id:
        save_to_db("study_resource", {"user_id": user_id, "content": content[:5000], "create_time": datetime.now().isoformat()})
    return {"code": 200, "content": content}

# ========== 接口3：答疑辅导智能体（智能体3）==========
@app.post("/api/chat")
def chat(weak: str = Form(""), question: str = Form(...), prompt: str = Form(""), user_id: str = Form("")):
    if prompt:
        ai_prompt = prompt
    else:
        ai_prompt = f"""
你是大学高数辅导老师，用户当前薄弱知识点：{weak}。
详细解答用户问题，解题步骤清晰，公式标准，通俗易懂。
用户问题：{question}
"""
    answer = call_llm(ai_prompt)
    if user_id:
        save_to_db("chat_log", {"user_id": user_id, "question": question[:2000], "answer": answer[:5000], "create_time": datetime.now().isoformat()})
    return {"code": 200, "answer": answer}

def parse_vtt(vtt_text):
    """解析WebVTT字幕，提取词级时间戳 [{text, start_ms, end_ms}]"""
    words = []
    lines = vtt_text.strip().split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if '-->' in line:
            # 时间行: 00:00:01.000 --> 00:00:01.500
            parts = line.split('-->')
            start = _vtt_time_to_ms(parts[0].strip())
            end = _vtt_time_to_ms(parts[1].strip())
            i += 1
            # 收集后续文本行直到空行
            text_parts = []
            while i < len(lines) and lines[i].strip():
                text_parts.append(lines[i].strip())
                i += 1
            text = ' '.join(text_parts)
            if text:
                words.append({"text": text, "start_ms": start, "end_ms": end})
        else:
            i += 1
    return words

def _vtt_time_to_ms(t):
    """00:00:01.500 或 00:00:01,500 -> 1500"""
    t = t.strip()
    # 兼容小数点 . 和逗号 ,
    sep = '.' if '.' in t else ','
    if sep in t:
        hms, ms = t.split(sep)
        ms = int(ms[:3].ljust(3, '0'))
    else:
        hms = t
        ms = 0
    parts = hms.split(':')
    h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
    return h * 3600000 + m * 60000 + s * 1000 + ms

# ========== 接口6：语音合成TTS（豆包优先 → Edge兜底）==========
@app.post("/api/tts")
async def tts(text: str = Form(...)):
    import subprocess, tempfile, os
    tts_text = text[:1500]

    # ── 方案1：豆包 TTS（更自然的语音）──
    DOUBAO_API_KEY = "ark-10379c9d-ddf0-4de3-b82d-23398deb3a29-65bea"
    DOUBAO_TTS_ENDPOINT = "ep-20260531173409-7sr5x"  # 如有TTS端点填这里，格式 ep-xxxxx
    DOUBAO_TTS_URL = f"https://ark.cn-beijing.volces.com/api/v3/endpoints/{DOUBAO_TTS_ENDPOINT}/audio/speech" if DOUBAO_TTS_ENDPOINT else "https://ark.cn-beijing.volces.com/api/v3/audio/speech"

    import base64 as b64, threading

    doubao_audio = None
    edge_audio = None
    edge_words = []

    # ── 并行：豆包出音频 + Edge出音频+字幕 ──
    def fetch_doubao():
        nonlocal doubao_audio
        if not DOUBAO_TTS_ENDPOINT:
            return
        try:
            headers = {"Authorization": f"Bearer {DOUBAO_API_KEY}", "Content-Type": "application/json"}
            data = {"model": DOUBAO_TTS_ENDPOINT, "input": tts_text, "voice": "zh_female_tianmei", "response_format": "mp3"}
            resp = requests.post(DOUBAO_TTS_URL, headers=headers, json=data, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 100:
                doubao_audio = resp.content
                print(f"✅ 豆包TTS合成成功，音频: {len(resp.content)} bytes")
        except Exception as e:
            print("豆包TTS异常:", str(e))

    def fetch_edge():
        nonlocal edge_audio, edge_words
        tmp_audio = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False)
        tmp_audio_path = tmp_audio.name
        tmp_audio.close()
        tmp_vtt = tempfile.NamedTemporaryFile(suffix=".vtt", delete=False)
        tmp_vtt_path = tmp_vtt.name
        tmp_vtt.close()
        try:
            result = subprocess.run([
                "edge-tts", "-v", "zh-CN-XiaoxiaoNeural", "-t", tts_text,
                "--write-media", tmp_audio_path,
                "--write-subtitles", tmp_vtt_path,
                "--rate=-10%"
            ], capture_output=True, text=True, timeout=30)
            if os.path.exists(tmp_audio_path):
                with open(tmp_audio_path, "rb") as f:
                    edge_audio = f.read()
            if os.path.exists(tmp_vtt_path):
                with open(tmp_vtt_path, "r") as f:
                    edge_words = parse_vtt(f.read())
            print(f"Edge完成，音频: {len(edge_audio or b'')} bytes, 字幕词数: {len(edge_words)}")
        except Exception as e:
            print("Edge异常:", str(e))
        for p in [tmp_audio_path, tmp_vtt_path]:
            if os.path.exists(p): os.unlink(p)

    t1 = threading.Thread(target=fetch_doubao)
    t2 = threading.Thread(target=fetch_edge)
    t1.start(); t2.start()
    t1.join(); t2.join()

    # 豆包音频 + Edge字幕（最佳组合）
    if doubao_audio:
        print(f"✅ 豆包音频 + Edge字幕，词数: {len(edge_words)}")
        return {"code": 200, "audio": b64.b64encode(doubao_audio).decode("utf-8"), "words": edge_words}

    # 豆包失败 → Edge兜底
    if edge_audio:
        print(f"⚠️ Edge兜底，音频: {len(edge_audio)} bytes, 字幕词数: {len(edge_words)}")
        return {"code": 200, "audio": b64.b64encode(edge_audio).decode("utf-8"), "words": edge_words}

    return {"code": 500, "msg": "TTS合成失败"}

# ========== 接口4：作业批改（文本）==========
@app.post("/api/grade")
def grade(prompt: str = Form(...)):
    content = call_llm(prompt)
    return {"code": 200, "content": content}

# ========== 接口5：作业批改（图片视觉分析-豆包Vision）==========
@app.post("/api/grade-image")
async def grade_image(file: UploadFile = File(...), question: str = Form(""), prompt: str = Form("")):
    import base64
    image_bytes = await file.read()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    vision_prompt = prompt if prompt else "请观察这张图片，简要描述你看到的内容（题目、解答过程等）。不需要逐字抄写，概括描述即可。"
    full_text = GLOBAL_EXPLAIN_RULE + "\n" + vision_prompt

    # 豆包视觉识别
    DOUBAO_API_KEY = "ark-10379c9d-ddf0-4de3-b82d-23398deb3a29-65bea"
    DOUBAO_ENDPOINT = "ep-20260602083741-jvshd"
    DOUBAO_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions"

    headers = {"Authorization": f"Bearer {DOUBAO_API_KEY}", "Content-Type": "application/json"}
    data = {
        "model": DOUBAO_ENDPOINT,
        "messages": [{"role": "user", "content": [{"type": "text", "text": full_text}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}]}],
        "temperature": 0.2
    }

    try:
        print(f"调用豆包Vision: {DOUBAO_URL}")
        resp = requests.post(DOUBAO_URL, headers=headers, json=data, timeout=60)
        result = resp.json()
        if "choices" in result:
            vision_result = result["choices"][0]["message"]["content"]
            print("豆包Vision结果：", vision_result[:200])
            # 判断是否包含学生作答：如果图片只有题目，直接给解答；如果有作答，批改
            judge_prompt = f"""请判断以下内容来自拍照的图片：
- 如果图片中是印刷的教材/教辅内容（包括题目和书上的例题解答），输出 TYPE:BOOK
- 如果图片中有手写的学生作答内容，输出 TYPE:HOMEWORK

图片内容：{vision_result[:500]}

只输出 TYPE:BOOK 或 TYPE:HOMEWORK"""
            img_type = call_llm(judge_prompt).strip()
            print("图片类型判断：", img_type[:50])

            if "BOOK" in img_type:
                final_prompt = f"请对以下题目给出完整、详细的解题步骤和答案：\n{vision_result[:1000]}"
            else:
                final_prompt = f"请批改以下手写作业：\n{vision_result[:1000]}\n给出：1.对错判断 2.错误步骤指正 3.完整正确解法"

            content = call_llm(final_prompt)
            return {"code": 200, "content": content}
        else:
            return {"code": 500, "msg": "视觉识别失败: " + str(result.get("error", "未知错误"))}
    except Exception as e:
        print("豆包Vision异常:", str(e))
        content = call_llm(vision_prompt + "\n（注：用户上传了图片）")
        return {"code": 200, "content": content}