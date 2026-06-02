from flask import Flask, request, jsonify, Response
from flask_cors import CORS
import requests, json, sqlite3, hashlib, base64, concurrent.futures, subprocess, tempfile, os, threading
from datetime import datetime

API_KEY = "sk-d0a10ee6bc0b4305b16a2014904bd986"
API_URL = "https://api.deepseek.com/v1/chat/completions"

app = Flask(__name__)
CORS(app)

def init_db():
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, create_time TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS user_profile (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, weak_points TEXT, error_reason TEXT, level TEXT, suggest TEXT, update_time TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS study_resource (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT, create_time TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question TEXT, answer TEXT, create_time TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS exercise_record (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question TEXT, user_answer TEXT, correct INTEGER DEFAULT 0, score INTEGER DEFAULT 0, kp_name TEXT, create_time TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS learning_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, study_minutes INTEGER DEFAULT 0, questions_done INTEGER DEFAULT 0, correct_count INTEGER DEFAULT 0, weak_kps TEXT, UNIQUE(user_id, date))''')
    c.execute('''CREATE TABLE IF NOT EXISTS user_sync (user_id INTEGER PRIMARY KEY, data_json TEXT, update_time TEXT)''')
    conn.commit()
    conn.close()

init_db()

def hash_password(pwd):
    return hashlib.sha256(pwd.encode()).hexdigest()

GLOBAL_EXPLAIN_RULE = """【强制格式要求，逐条遵守】
1. 可以正常使用数学符号、字母、公式，但**禁止输出任何LaTeX语法标记**（如\\int、\\frac、\\cdot、\\quad、\\boxed、\\left、\\right等）。
2. 公式直接用纯数学符号书写：
    - ∫(2x+1)dx 代替 \\int(2x+1)dx
    - 2x/(x²+1) 代替 \\frac{2x}{x²+1}
    - sin(x) 代替 \\sin x
    - x² 代替 x^2
3. 解题步骤拆分完整，使用「第一步、第二步、第三步」依次书写。
4. 语言通俗易懂，步骤解释清晰。
5. 使用以下标记让重点内容突出显示：**核心术语**用于标注定义定理公式名称，==关键公式==用于标注重要数学表达式，!!易错警告!!用于标注容易出错的地方，__章节标题__用于大标题，--例题标记--用于标注例题。"""

def call_llm(prompt):
    full_prompt = GLOBAL_EXPLAIN_RULE + "\n" + prompt
    headers = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
    data = {"model": "deepseek-chat", "messages": [{"role": "user", "content": full_prompt}], "temperature": 0.2}
    # PythonAnywhere免费版需通过代理访问外部API
    proxies = {"http": "http://proxy.server:3128", "https": "http://proxy.server:3128"}
    try:
        resp = requests.post(API_URL, headers=headers, json=data, timeout=60, proxies=proxies)
        return resp.json()["choices"][0]["message"]["content"]
    except Exception as e:
        return f"AI调用失败：{str(e)}"

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

def parse_vtt(vtt_text):
    words = []
    lines = vtt_text.strip().split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if '-->' in line:
            parts = line.split('-->')
            start = _vtt_time_to_ms(parts[0].strip())
            end = _vtt_time_to_ms(parts[1].strip())
            i += 1
            text_parts = []
            while i < len(lines) and lines[i].strip():
                text_parts.append(lines[i].strip())
                i += 1
            text = ' '.join(text_parts)
            if text: words.append({"text": text, "start_ms": start, "end_ms": end})
        else:
            i += 1
    return words

def _vtt_time_to_ms(t):
    t = t.strip()
    sep = '.' if '.' in t else ','
    if sep in t:
        hms, ms = t.split(sep)
        ms = int(ms[:3].ljust(3, '0'))
    else:
        hms, ms = t, 0
    parts = hms.split(':')
    h, m, s = int(parts[0]), int(parts[1]), int(parts[2])
    return h * 3600000 + m * 60000 + s * 1000 + ms

# ===== 注册 =====
@app.route("/api/register", methods=["POST"])
def register():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    if len(username) < 2 or len(password) < 6:
        return jsonify({"code": 400, "msg": "用户名至少2位，密码至少6位"})
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT id FROM user WHERE username=?", (username,))
    if c.fetchone():
        conn.close()
        return jsonify({"code": 400, "msg": "用户名已存在"})
    c.execute("INSERT INTO user (username, password, create_time) VALUES (?, ?, ?)", (username, hash_password(password), datetime.now().isoformat()))
    conn.commit()
    uid = c.lastrowid
    conn.close()
    return jsonify({"code": 200, "msg": "注册成功", "data": {"user_id": uid, "username": username}})

# ===== 登录 =====
@app.route("/api/login", methods=["POST"])
def login():
    username = request.form.get("username", "").strip()
    password = request.form.get("password", "")
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT id, username FROM user WHERE username=? AND password=?", (username, hash_password(password)))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify({"code": 200, "msg": "登录成功", "data": {"user_id": row[0], "username": row[1]}})
    return jsonify({"code": 401, "msg": "用户名或密码错误"})

# ===== 多智能体协同 =====
@app.route("/api/workflow", methods=["POST"])
def workflow():
    wrong_content = request.form.get("wrong_content", "")
    user_id = request.form.get("user_id", "")
    diagnosis_prompt = f"""你是资深高数教师，根据用户错题分析，严格输出JSON格式。\n格式：\n{{\n  "weak_knowledge": "薄弱知识点",\n  "error_type": "错误类型",\n  "error_reason": "错误原因",\n  "mastery_level": "入门/中等/较好",\n  "easy_mistake_points": "高频易错点",\n  "study_suggest": "学习建议"\n}}\n用户错题内容：{wrong_content}"""
    diag_result = call_llm(diagnosis_prompt)
    try:
        diag_data = json.loads(diag_result)
    except:
        return jsonify({"code": 500, "msg": "诊断解析失败", "raw": diag_result})
    weak = diag_data.get("weak_knowledge", "")
    level = diag_data.get("mastery_level", "中等")

    def gen_notebook():
        return call_llm(f"你是高数教师，根据错题整理错题本。输出：1.错题归类 2.原题+错误分析 3.标准解析 4.2~3道同类变式题 5.复习建议。错题：{wrong_content} 薄弱点：{weak}")
    def gen_graph():
        return call_llm(f"你是高数知识图谱专家。解读薄弱知识点{weak}在完整知识体系中的位置。输出：一、定位 二、前置知识 三、关联知识点 四、延伸方向 五、学习顺序建议")
    def gen_exercises():
        return call_llm(f"你是高数出题老师。薄弱知识点：{weak}，水平：{level}。禁止LaTeX。输出：1.知识点总结 2.基础题1道+提升题2道，每题附完整解题步骤+答案")

    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        f1, f2, f3 = executor.submit(gen_notebook), executor.submit(gen_graph), executor.submit(gen_exercises)
        notebook_content, graph_content, exercise_content = f1.result(), f2.result(), f3.result()

    sync_data = None
    if user_id:
        conn = sqlite3.connect("database.db")
        c = conn.cursor()
        now = datetime.now().isoformat()
        today = datetime.now().strftime("%Y-%m-%d")
        c.execute("INSERT INTO user_profile (user_id, weak_points, error_reason, level, suggest, update_time) VALUES (?,?,?,?,?,?)", (user_id, weak, diag_data.get("error_reason",""), level, diag_data.get("study_suggest",""), now))
        c.execute("INSERT INTO exercise_record (user_id, question, correct, kp_name, create_time) VALUES (?,?,0,?,?)", (user_id, wrong_content[:2000], weak, now))
        c.execute("SELECT id FROM learning_progress WHERE user_id=? AND date=?", (user_id, today))
        if c.fetchone():
            c.execute("UPDATE learning_progress SET questions_done=questions_done+1 WHERE user_id=? AND date=?", (user_id, today))
        else:
            c.execute("INSERT INTO learning_progress (user_id, date, questions_done) VALUES (?,?,1)", (user_id, today))
        c.execute("SELECT question FROM exercise_record WHERE user_id=? ORDER BY create_time DESC LIMIT 50", (user_id,))
        all_errors = [r[0][:200] for r in c.fetchall()]
        sync = {"weak_point": weak, "mastery_level": level, "error_list": all_errors}
        c.execute("INSERT OR REPLACE INTO user_sync (user_id, data_json, update_time) VALUES (?,?,?)", (user_id, json.dumps(sync, ensure_ascii=False), now))
        conn.commit()
        conn.close()
        sync_data = sync

    return jsonify({"code": 200, "data": {"diagnosis": diag_data, "notebook": notebook_content, "graph": graph_content, "exercises": exercise_content, "sync": sync_data}})

# ===== 同步 =====
@app.route("/api/sync/save", methods=["POST"])
def sync_save():
    user_id = request.form.get("user_id", "")
    data_json = request.form.get("data_json", "{}")
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO user_sync (user_id, data_json, update_time) VALUES (?, ?, ?)", (user_id, data_json, datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({"code": 200, "msg": "同步成功"})

@app.route("/api/sync/load", methods=["POST"])
def sync_load():
    user_id = request.form.get("user_id", "")
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT data_json FROM user_sync WHERE user_id=?", (user_id,))
    row = c.fetchone()
    conn.close()
    if row:
        return jsonify({"code": 200, "data": json.loads(row[0])})
    return jsonify({"code": 200, "data": {}})

# ===== 学习进度 =====
@app.route("/api/progress", methods=["POST"])
def get_progress():
    user_id = request.form.get("user_id", "")
    if not user_id:
        return jsonify({"code": 400, "msg": "缺少user_id"})
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("SELECT COUNT(*), SUM(correct) FROM exercise_record WHERE user_id=?", (user_id,))
    total, correct = c.fetchone()
    total, correct = total or 0, correct or 0
    c.execute("SELECT date, questions_done, study_minutes FROM learning_progress WHERE user_id=? ORDER BY date DESC LIMIT 7", (user_id,))
    daily = [{"date": r[0], "questions": r[1] or 0, "minutes": r[2] or 0} for r in c.fetchall()]
    c.execute("SELECT weak_points, level, update_time FROM user_profile WHERE user_id=? ORDER BY update_time DESC LIMIT 5", (user_id,))
    profiles = [{"weak_points": r[0], "level": r[1], "time": r[2]} for r in c.fetchall()]
    conn.close()
    return jsonify({"code": 200, "data": {"total_questions": total, "correct_count": correct, "accuracy": round(correct*100/max(total,1), 1), "daily": daily, "profiles": profiles}})

# ===== 学情分析 =====
@app.route("/api/analysis", methods=["POST"])
def analysis():
    wrong_content = request.form.get("wrong_content", "")
    prompt = f"你是资深高数教师，根据用户错题分析，严格输出JSON格式。\n格式：\n{{\n  \"weak_knowledge\": \"薄弱知识点\",\n  \"error_reason\": \"错误原因\",\n  \"mastery_level\": \"入门/中等/较好\",\n  \"suggest\": \"简短学习建议\"\n}}\n用户错题内容：{wrong_content}"
    ai_res = call_llm(prompt)
    try:
        return jsonify({"code": 200, "data": json.loads(ai_res)})
    except:
        return jsonify({"code": 500, "msg": "解析失败", "raw": ai_res})

# ===== 资源生成 =====
@app.route("/api/generate", methods=["POST"])
def generate():
    weak = request.form.get("weak", "")
    level = request.form.get("level", "")
    prompt = request.form.get("prompt", "")
    user_id = request.form.get("user_id", "")
    if prompt:
        ai_prompt = prompt
    else:
        ai_prompt = f"你是高数出题老师，用户薄弱知识点：{weak}，掌握水平：{level}。禁止LaTeX。输出：1.知识点总结 2.3道习题(1基础+2提升)，每题附完整解题步骤+答案。"
    content = call_llm(ai_prompt)
    if user_id:
        save_to_db("study_resource", {"user_id": user_id, "content": content[:5000], "create_time": datetime.now().isoformat()})
    return jsonify({"code": 200, "content": content})

# ===== 答疑 =====
@app.route("/api/chat", methods=["POST"])
def chat():
    weak = request.form.get("weak", "")
    question = request.form.get("question", "")
    prompt = request.form.get("prompt", "")
    user_id = request.form.get("user_id", "")
    if prompt:
        ai_prompt = prompt
    else:
        ai_prompt = f"你是大学高数辅导老师，用户当前薄弱知识点：{weak}。详细解答用户问题。用户问题：{question}"
    answer = call_llm(ai_prompt)
    if user_id:
        save_to_db("chat_log", {"user_id": user_id, "question": question[:2000], "answer": answer[:5000], "create_time": datetime.now().isoformat()})
    return jsonify({"code": 200, "answer": answer})

# ===== TTS =====
@app.route("/api/tts", methods=["POST"])
def tts():
    text = request.form.get("text", "")[:1500]
    DOUBAO_API_KEY = "ark-10379c9d-ddf0-4de3-b82d-23398deb3a29-65bea"
    DOUBAO_TTS_ENDPOINT = "ep-20260531173409-7sr5x"
    DOUBAO_TTS_URL = f"https://ark.cn-beijing.volces.com/api/v3/endpoints/{DOUBAO_TTS_ENDPOINT}/audio/speech" if DOUBAO_TTS_ENDPOINT else "https://ark.cn-beijing.volces.com/api/v3/audio/speech"
    doubao_audio, edge_audio, edge_words = None, None, []

    def fetch_doubao():
        nonlocal doubao_audio
        if not DOUBAO_TTS_ENDPOINT: return
        try:
            headers = {"Authorization": f"Bearer {DOUBAO_API_KEY}", "Content-Type": "application/json"}
            data = {"model": DOUBAO_TTS_ENDPOINT, "input": text, "voice": "zh_female_tianmei", "response_format": "mp3"}
            resp = requests.post(DOUBAO_TTS_URL, headers=headers, json=data, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 100:
                doubao_audio = resp.content
        except: pass

    def fetch_edge():
        nonlocal edge_audio, edge_words
        ta = tempfile.NamedTemporaryFile(suffix=".mp3", delete=False); tap = ta.name; ta.close()
        tv = tempfile.NamedTemporaryFile(suffix=".vtt", delete=False); tvp = tv.name; tv.close()
        try:
            subprocess.run(["edge-tts","-v","zh-CN-XiaoxiaoNeural","-t",text,"--write-media",tap,"--write-subtitles",tvp,"--rate=-10%"], capture_output=True, text=True, timeout=30)
            if os.path.exists(tap):
                with open(tap,"rb") as f: edge_audio = f.read()
            if os.path.exists(tvp):
                with open(tvp,"r") as f: edge_words = parse_vtt(f.read())
        except: pass
        for p in [tap, tvp]:
            if os.path.exists(p): os.unlink(p)

    t1 = threading.Thread(target=fetch_doubao); t2 = threading.Thread(target=fetch_edge)
    t1.start(); t2.start(); t1.join(); t2.join()

    if doubao_audio:
        return jsonify({"code": 200, "audio": base64.b64encode(doubao_audio).decode("utf-8"), "words": edge_words})
    if edge_audio:
        return jsonify({"code": 200, "audio": base64.b64encode(edge_audio).decode("utf-8"), "words": edge_words})
    return jsonify({"code": 500, "msg": "TTS合成失败"})

# ===== 批改 =====
@app.route("/api/grade", methods=["POST"])
def grade():
    prompt = request.form.get("prompt", "")
    return jsonify({"code": 200, "content": call_llm(prompt)})

@app.route("/api/grade-image", methods=["POST"])
def grade_image():
    file = request.files.get("file")
    question = request.form.get("question", "")
    prompt = request.form.get("prompt", "")
    if not file:
        return jsonify({"code": 400, "msg": "请上传图片"})
    image_b64 = base64.b64encode(file.read()).decode("utf-8")
    vision_prompt = prompt or "请观察这张图片，简要描述你看到的内容。"
    full_text = GLOBAL_EXPLAIN_RULE + "\n" + vision_prompt

    DOUBAO_API_KEY = "ark-10379c9d-ddf0-4de3-b82d-23398deb3a29-65bea"
    DOUBAO_ENDPOINT = "ep-20260602083741-jvshd"
    headers = {"Authorization": f"Bearer {DOUBAO_API_KEY}", "Content-Type": "application/json"}
    data = {"model": DOUBAO_ENDPOINT, "messages": [{"role": "user", "content": [{"type": "text", "text": full_text}, {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}}]}], "temperature": 0.2}

    try:
        resp = requests.post("https://ark.cn-beijing.volces.com/api/v3/chat/completions", headers=headers, json=data, timeout=60)
        result = resp.json()
        if "choices" in result:
            vision_result = result["choices"][0]["message"]["content"]
            judge_prompt = f"判断以下内容：如果图片中是印刷的教材教辅内容输出TYPE:BOOK，如果图片中有手写学生作答输出TYPE:HOMEWORK。\n图片内容：{vision_result[:500]}\n只输出TYPE:BOOK或TYPE:HOMEWORK"
            img_type = call_llm(judge_prompt).strip()
            if "BOOK" in img_type:
                final_prompt = f"请对以下题目给出完整详细的解题步骤和答案：\n{vision_result[:1000]}"
            else:
                final_prompt = f"请批改以下手写作业：\n{vision_result[:1000]}\n给出：1.对错判断 2.错误步骤指正 3.完整正确解法"
            return jsonify({"code": 200, "content": call_llm(final_prompt)})
        return jsonify({"code": 500, "msg": f"视觉识别失败: {result.get('error', '未知')}"})
    except Exception as e:
        print("Vision异常:", e)
        return jsonify({"code": 200, "content": call_llm(vision_prompt + "\n（注：用户上传了图片）")})

@app.route("/")
def home():
    return "高数AI系统后端运行中"

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
