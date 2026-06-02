from flask import Flask, request, jsonify
from flask_cors import CORS
import requests, json, sqlite3, hashlib, base64, os, tempfile, subprocess, threading
from datetime import datetime

API_KEY = "sk-d0a10ee6bc0b4305b16a2014904bd986"
API_URL = "https://api.deepseek.com/v1/chat/completions"

app = Flask(__name__)
CORS(app)

def init_db():
    conn = sqlite3.connect("database.db")
    c = conn.cursor()
    c.execute("CREATE TABLE IF NOT EXISTS user (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, password TEXT, create_time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS user_profile (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, weak_points TEXT, error_reason TEXT, level TEXT, suggest TEXT, update_time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS study_resource (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, content TEXT, create_time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS chat_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question TEXT, answer TEXT, create_time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS exercise_record (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, question TEXT, correct INTEGER DEFAULT 0, kp_name TEXT, create_time TEXT)")
    c.execute("CREATE TABLE IF NOT EXISTS learning_progress (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, date TEXT, study_minutes INTEGER DEFAULT 0, questions_done INTEGER DEFAULT 0, UNIQUE(user_id, date))")
    c.execute("CREATE TABLE IF NOT EXISTS user_sync (user_id INTEGER PRIMARY KEY, data_json TEXT, update_time TEXT)")
    conn.commit()
    conn.close()

init_db()

RULES = "【规则】禁止LaTeX语法，用纯数学符号。分步解题用第一步第二步。用**术语**标注定义，==公式==标蓝，!!警告!!标红，__标题__大字，--例题--绿色。"

def call_llm(prompt):
    headers = {"Authorization": "Bearer " + API_KEY, "Content-Type": "application/json"}
    body = {"model": "deepseek-chat", "messages": [{"role": "user", "content": RULES + "\n" + prompt}], "temperature": 0.2}
    prox = {"http": "http://proxy.server:3128", "https": "http://proxy.server:3128"}
    try:
        r = requests.post(API_URL, headers=headers, json=body, timeout=60, proxies=prox)
        return r.json()["choices"][0]["message"]["content"]
    except:
        return "AI调用失败"

@app.route("/")
def home():
    return "高数AI后端运行中 OK"

@app.route("/api/register", methods=["POST"])
def register():
    u = request.form.get("username","").strip()
    p = request.form.get("password","")
    if len(u) < 2 or len(p) < 6:
        return jsonify({"code":400,"msg":"用户名至少2位，密码至少6位"})
    conn = sqlite3.connect("database.db"); c = conn.cursor()
    c.execute("SELECT id FROM user WHERE username=?",(u,))
    if c.fetchone(): conn.close(); return jsonify({"code":400,"msg":"用户名已存在"})
    c.execute("INSERT INTO user (username,password,create_time) VALUES (?,?,?)",(u,hashlib.sha256(p.encode()).hexdigest(),datetime.now().isoformat()))
    conn.commit(); uid = c.lastrowid; conn.close()
    return jsonify({"code":200,"msg":"注册成功","data":{"user_id":uid,"username":u}})

@app.route("/api/login", methods=["POST"])
def login():
    u = request.form.get("username","").strip()
    p = request.form.get("password","")
    conn = sqlite3.connect("database.db"); c = conn.cursor()
    c.execute("SELECT id,username FROM user WHERE username=? AND password=?",(u,hashlib.sha256(p.encode()).hexdigest()))
    row = c.fetchone(); conn.close()
    if row: return jsonify({"code":200,"msg":"登录成功","data":{"user_id":row[0],"username":row[1]}})
    return jsonify({"code":401,"msg":"用户名或密码错误"})

@app.route("/api/workflow", methods=["POST"])
def workflow():
    content = request.form.get("wrong_content","")
    uid = request.form.get("user_id","")
    diag = call_llm("你是高数教师，分析错题输出JSON：{\"weak_knowledge\":\"\",\"error_type\":\"\",\"error_reason\":\"\",\"mastery_level\":\"入门/中等/较好\",\"easy_mistake_points\":\"\",\"study_suggest\":\"\"}。错题：" + content)
    try: d = json.loads(diag)
    except: return jsonify({"code":500,"msg":"解析失败"})
    weak = d.get("weak_knowledge",""); level = d.get("mastery_level","中等")
    nbook = call_llm("整理错题本：1归类2原题分析3标准解析4变式题5建议。错题：" + content + " 薄弱点：" + weak)
    graph = call_llm("知识图谱解读" + weak + "：一定位二前置三关联四延伸五建议")
    exer = call_llm("出题：" + weak + " 水平" + level + "。知识点总结+3道题(1基础2提升)附步骤答案。禁止LaTeX")
    if uid:
        conn = sqlite3.connect("database.db"); c = conn.cursor()
        n = datetime.now().isoformat(); t = datetime.now().strftime("%Y-%m-%d")
        c.execute("INSERT INTO user_profile (user_id,weak_points,error_reason,level,suggest,update_time) VALUES (?,?,?,?,?,?)",(uid,weak,d.get("error_reason",""),level,d.get("study_suggest",""),n))
        c.execute("INSERT INTO exercise_record (user_id,question,correct,kp_name,create_time) VALUES (?,?,0,?,?)",(uid,content[:2000],weak,n))
        c.execute("SELECT id FROM learning_progress WHERE user_id=? AND date=?",(uid,t))
        if c.fetchone(): c.execute("UPDATE learning_progress SET questions_done=questions_done+1 WHERE user_id=? AND date=?",(uid,t))
        else: c.execute("INSERT INTO learning_progress (user_id,date,questions_done) VALUES (?,?,1)",(uid,t))
        c.execute("SELECT question FROM exercise_record WHERE user_id=? ORDER BY create_time DESC LIMIT 50",(uid,))
        errs = [r[0][:200] for r in c.fetchall()]
        sync = {"weak_point":weak,"mastery_level":level,"error_list":errs}
        c.execute("INSERT OR REPLACE INTO user_sync (user_id,data_json,update_time) VALUES (?,?,?)",(uid,json.dumps(sync),n))
        conn.commit(); conn.close()
    return jsonify({"code":200,"data":{"diagnosis":d,"notebook":nbook,"graph":graph,"exercises":exer,"sync":sync if uid else None}})

@app.route("/api/sync/save", methods=["POST"])
def sync_save():
    uid = request.form.get("user_id",""); data = request.form.get("data_json","{}")
    conn = sqlite3.connect("database.db"); c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO user_sync (user_id,data_json,update_time) VALUES (?,?,?)",(uid,data,datetime.now().isoformat()))
    conn.commit(); conn.close()
    return jsonify({"code":200,"msg":"ok"})

@app.route("/api/sync/load", methods=["POST"])
def sync_load():
    uid = request.form.get("user_id","")
    conn = sqlite3.connect("database.db"); c = conn.cursor()
    c.execute("SELECT data_json FROM user_sync WHERE user_id=?",(uid,))
    row = c.fetchone(); conn.close()
    return jsonify({"code":200,"data":json.loads(row[0]) if row else {}})

@app.route("/api/progress", methods=["POST"])
def progress():
    uid = request.form.get("user_id","")
    if not uid: return jsonify({"code":400})
    conn = sqlite3.connect("database.db"); c = conn.cursor()
    c.execute("SELECT COUNT(*),SUM(correct) FROM exercise_record WHERE user_id=?",(uid,))
    t,co = c.fetchone(); t,co = t or 0, co or 0
    c.execute("SELECT date,questions_done FROM learning_progress WHERE user_id=? ORDER BY date DESC LIMIT 7",(uid,))
    daily = [{"date":r[0],"questions":r[1] or 0} for r in c.fetchall()]
    conn.close()
    return jsonify({"code":200,"data":{"total_questions":t,"accuracy":round(co*100/max(t,1),1),"daily":daily}})

@app.route("/api/analysis", methods=["POST"])
def analysis():
    c = request.form.get("wrong_content","")
    r = call_llm("分析错题输出JSON：{\"weak_knowledge\":\"\",\"error_reason\":\"\",\"mastery_level\":\"\",\"suggest\":\"\"}。错题：" + c)
    try: return jsonify({"code":200,"data":json.loads(r)})
    except: return jsonify({"code":500,"raw":r})

@app.route("/api/generate", methods=["POST"])
def generate():
    w = request.form.get("weak",""); l = request.form.get("level","")
    p = request.form.get("prompt",""); uid = request.form.get("user_id","")
    txt = call_llm(p if p else "出题："+w+" 水平"+l+"。知识点总结+3道题附步骤。禁止LaTeX")
    if uid:
        conn = sqlite3.connect("database.db"); c = conn.cursor()
        c.execute("INSERT INTO study_resource (user_id,content,create_time) VALUES (?,?,?)",(uid,txt[:5000],datetime.now().isoformat()))
        conn.commit(); conn.close()
    return jsonify({"code":200,"content":txt})

@app.route("/api/chat", methods=["POST"])
def chat():
    w = request.form.get("weak",""); q = request.form.get("question","")
    p = request.form.get("prompt",""); uid = request.form.get("user_id","")
    ans = call_llm(p if p else "你是高数辅导老师。薄弱点："+w+"。问题："+q)
    if uid:
        conn = sqlite3.connect("database.db"); c = conn.cursor()
        c.execute("INSERT INTO chat_log (user_id,question,answer,create_time) VALUES (?,?,?,?)",(uid,q[:2000],ans[:5000],datetime.now().isoformat()))
        conn.commit(); conn.close()
    return jsonify({"code":200,"answer":ans})

@app.route("/api/grade", methods=["POST"])
def grade():
    return jsonify({"code":200,"content":call_llm(request.form.get("prompt",""))})

@app.route("/api/grade-image", methods=["POST"])
def grade_image():
    file = request.files.get("file")
    if not file: return jsonify({"code":400,"msg":"请上传图片"})
    b64 = base64.b64encode(file.read()).decode()
    txt = call_llm(request.form.get("prompt","请描述图片内容") + "\n图片：" + b64[:100] + "...")
    return jsonify({"code":200,"content":call_llm("批改作业：" + txt)})

@app.route("/api/tts", methods=["POST"])
def tts():
    text = request.form.get("text","")[:1500]
    DOUBAO = "ark-10379c9d-ddf0-4de3-b82d-23398deb3a29-65bea"
    EP = "ep-20260531173409-7sr5x"
    if EP:
        try:
            h = {"Authorization":"Bearer "+DOUBAO,"Content-Type":"application/json"}
            d = {"model":EP,"input":text,"voice":"zh_female_tianmei","response_format":"mp3"}
            r = requests.post("https://ark.cn-beijing.volces.com/api/v3/endpoints/"+EP+"/audio/speech",headers=h,json=d,timeout=30)
            if r.status_code==200 and len(r.content)>100:
                return jsonify({"code":200,"audio":base64.b64encode(r.content).decode(),"words":[]})
        except: pass
    try:
        ta = tempfile.NamedTemporaryFile(suffix=".mp3",delete=False); tap = ta.name; ta.close()
        tv = tempfile.NamedTemporaryFile(suffix=".vtt",delete=False); tvp = tv.name; tv.close()
        subprocess.run(["edge-tts","-v","zh-CN-XiaoxiaoNeural","-t",text,"--write-media",tap,"--write-subtitles",tvp],capture_output=True,timeout=30)
        if os.path.exists(tap):
            with open(tap,"rb") as f: aud = f.read()
            words = []
            if os.path.exists(tvp):
                with open(tvp) as f:
                    for line in f.read().strip().split("\n"):
                        if "-->" in line:
                            parts = line.split("-->"); start = parts[0].strip()
                            txts = []; i = next((j+1 for j,l in enumerate(f.read().split("\n")) if not l.strip()),0)
            for p in [tap,tvp]:
                if os.path.exists(p): os.unlink(p)
            return jsonify({"code":200,"audio":base64.b64encode(aud).decode(),"words":words})
    except: pass
    return jsonify({"code":500,"msg":"TTS失败"})

application = app
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000)
