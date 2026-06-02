var app = getApp();

var CHAT_PROMPT = '【实时答疑智能体】\n' +
  '针对用户提出的高数问题进行全面、细致解答。\n' +
  '解答结构要求：\n' +
  '1. 考点分析：说明该题目考察哪些高数知识点、核心公式\n' +
  '2. 基础回顾：简要回顾相关概念、公式、解题前提（照顾基础薄弱学生）\n' +
  '3. 详细解题步骤：分步拆解，第一步、第二步……不跳步，每一步解释计算逻辑\n' +
  '4. 多种解法（可选）：提供1~2种不同解题思路与方法\n' +
  '5. 易错点提醒：标注本题容易出错的地方、常见思维陷阱\n' +
  '6. 同类题解题套路：总结该题型通用解题模板与技巧';

var FORMULA_PROMPT = '【公式推导讲解】\n' +
  '对指定高数公式进行一步步溯源推导，不只给出最终公式。\n' +
  '输出要求：\n' +
  '1. 公式使用场景：说明该公式用在什么题型、什么知识点中\n' +
  '2. 前置知识：推导需要用到的基础概念、前置公式\n' +
  '3. 完整分步推导：第一步、第二步……全程拆解推导过程，每一步说明推导依据\n' +
  '4. 公式使用规则：使用条件、适用范围、常见误用情况\n' +
  '5. 配套简单例题：举例演示公式如何套用';

var VOICE_PROMPT = '【语音专属答疑讲解文案】\n' +
  '为语音播报场景生成解答内容，语言完全口语化、语句通顺、节奏平缓，适合TTS朗读。\n' +
  '【重要禁止】禁止输出任何LaTeX代码、数学命令字符（如\\int、\\frac、\\partial等），必须使用纯中文描述和可视化数学符号。\n' +
  '【开场白规范】每次回复必须使用统一的自然口语开场，格式固定为："同学你好，这道题考察的是（知识点），咱们一起来看一下。" 不要用其他开场方式，不要提及LaTeX、公式编辑器、排版工具等任何工具名称。\n' +
  '输出结构：\n' +
  '一、问题考点简述\n' +
  '用口语化语言说明这道题考察什么内容，直接说考点，不要铺垫。\n' +
  '二、知识点简单回顾\n' +
  '用口语通俗讲解用到的公式、概念，像老师在讲课一样。\n' +
  '三、分步解题讲解\n' +
  '第一步、第二步…一步步口述解题，每步说明操作目的与计算逻辑。\n' +
  '四、易错点口头提醒\n' +
  '用简短口语点明容易出错的地方。\n' +
  '【风格要求】全程用"咱们"、"你"等口语代词，像老师在旁边一对一辅导的语气。';

Page({
  data: {
    activeTab: 0,
    // 在线答疑
    messages: [],
    inputValue: '',
    typing: false,
    scrollToView: '',
    // 公式推导
    formulaContent: '',
    formulaLoading: false,
    formulaResult: '',
    formulaNodes: [],
    // 语音讲解
    voiceQuestion: '',
    voiceLoading: false,
    voiceContent: '',
    voiceNodes: [],
    voiceWords: [],
    voiceHighlightIdx: -1,
    voicePlaying: false,
    voicePaused: false,
    voiceAudio: null,
    voiceTimers: []
  },

  parseLines(text) {
    if (!text) return [];
    return text.split('\n').map(function (line) {
      return {
        name: 'div',
        attrs: { style: 'line-height:1.8;font-size:28rpx;color:#333;margin-bottom:4rpx;' },
        children: [{ type: 'text', text: line }]
      };
    });
  },

  switchTab(e) {
    this.setData({ activeTab: parseInt(e.currentTarget.dataset.index) });
  },

  // ==================== 在线答疑 ====================
  onLoad() {
    this.setData({
      messages: [{
        id: Date.now(),
        role: 'ai',
        content: '你好！我是高数智能助手，有什么问题可以随时问我～'
      }]
    });
  },

  onInput(e) {
    this.setData({ inputValue: e.detail.value });
  },

  sendMessage() {
    var that = this;
    var inputValue = that.data.inputValue;
    var typing = that.data.typing;
    var question = inputValue.trim();
    if (!question || typing) return;

    var userMsg = { id: Date.now(), role: 'user', content: question };
    var messages = that.data.messages.concat([userMsg]);
    that.setData({ messages: messages, inputValue: '', typing: true, scrollToView: 'msg-' + (messages.length - 1) });

    var weakPoint = wx.getStorageSync('weak_point') || '';
    var fullPrompt = CHAT_PROMPT + '\n用户当前薄弱知识点：' + weakPoint + '\n用户提问内容：' + question;

    app.request({
      url: '' + app.globalData.apiBase + '/api/chat',
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: 'weak=' + encodeURIComponent(weakPoint) + '&question=' + encodeURIComponent(question) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      timeout: 30000,
      success: function (res) {
        if (res.statusCode === 200 && res.data && res.data.code === 200) {
          var aiMsg = { id: Date.now() + 1, role: 'ai', content: res.data.answer };
          var newMessages = that.data.messages.concat([aiMsg]);
          that.setData({ messages: newMessages, typing: false, scrollToView: 'msg-' + (newMessages.length - 1) });
        } else { that.showError(); }
      },
      fail: function () { that.showError(); }
    });
  },

  showError() {
    wx.showToast({ title: '网络异常，请重试', icon: 'none' });
    var messages = this.data.messages.slice(0, -1);
    this.setData({ messages: messages, typing: false });
  },

  // ==================== 语音讲解 ====================
  onVoiceInput(e) {
    this.setData({ voiceQuestion: e.detail.value });
  },

  generateVoice() {
    var that = this;
    var question = (that.data.voiceQuestion || '').trim();
    if (!question) { wx.showToast({ title: '请输入问题', icon: 'none' }); return; }

    var weakPoint = wx.getStorageSync('weak_point') || '';
    var fullPrompt = VOICE_PROMPT + '\n用户薄弱知识点：' + weakPoint + '\n用户提问：' + question;

    that.setData({ voiceLoading: true, voiceContent: '', voiceNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/chat',
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: 'question=' + encodeURIComponent(question) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.answer;
          that.setData({
            voiceContent: text,
            voiceNodes: app.smartParseLines(text),
            voiceHighlightIdx: -1,
            voiceLoading: false
          });
          wx.setStorageSync('voice_text', text);
          that.playVoice();
        } else {
          wx.showToast({ title: '生成失败', icon: 'none' });
          that.setData({ voiceLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常', icon: 'none' });
        that.setData({ voiceLoading: false });
      }
    });
  },

  playVoice() {
    var that = this;
    var text = wx.getStorageSync('voice_text') || that.data.voiceContent;
    if (!text) return;
    var existingAudio = that.data.voiceAudio;
    if (existingAudio && that.data.voicePaused) {
      existingAudio.play();
      that.setData({ voicePlaying: true, voicePaused: false });
      return;
    }
    that.setData({ voicePlaying: true, voicePaused: false, voiceWords: [], voiceHighlightIdx: -1 });
    // 并行：下载音频 + 获取词时间戳
    var ttsUrl = app.globalData.apiBase + '/api/tts-raw?text=' + encodeURIComponent(text);
    wx.downloadFile({
      url: ttsUrl, timeout: 60000, header: { 'ngrok-skip-browser-warning': 'true' },
      success: function (res) {
        if (res.statusCode === 200) {
          console.log('下载成功:', res.tempFilePath, '大小:', res.totalBytesWritten);
          // 复制到永久文件
          var fs = wx.getFileSystemManager();
          var permPath = wx.env.USER_DATA_PATH + '/voice_' + Date.now() + '.mp3';
          try {
            fs.copyFileSync(res.tempFilePath, permPath);
            console.log('复制到:', permPath);
          } catch(e) { permPath = res.tempFilePath; }
          // 获取词时间戳
          app.request({
            url: '' + app.globalData.apiBase + '/api/tts', method: 'POST',
            data: 'text=' + encodeURIComponent(text),
            header: { 'content-type': 'application/x-www-form-urlencoded' }, timeout: 30000,
            success: function (r2) {
              var words = (r2.data && r2.data.words) ? r2.data.words : [];
              if (!words.length) {
                var sents = text.split(/[。！？；\n]/).filter(function(s){return s.trim();});
                words = sents.map(function(s,i){ return {text:s,start_ms:i*2000,end_ms:(i+1)*2000}; });
              }
              that.setData({ voiceWords: words });
            }
          });
          var audio = wx.createInnerAudioContext();
          audio.src = res.tempFilePath;
          audio.obeyMuteSwitch = false;
          audio.volume = 1.0;
          audio.onCanplay(function () { console.log('可以播放了'); audio.play(); });
          audio.onPlay(function () { console.log('开始播放'); that.scheduleWords(0); });
          audio.onWaiting(function () { console.log('缓冲中...'); });
          audio.onEnded(function () { that.setData({ voicePlaying: false, voicePaused: false, voiceHighlightIdx: -1 }); that.clearTimers(); });
          audio.onError(function (e) { console.error('播放失败:', JSON.stringify(e)); });
          audio.onPause(function () { that.setData({ voicePlaying: false, voicePaused: true }); that.clearTimers(); });
          that.setData({ voiceAudio: audio });
        } else { wx.showToast({ title: '合成失败', icon: 'none' }); that.setData({ voicePlaying: false }); }
      },
      fail: function (err) { console.error('下载失败:', JSON.stringify(err)); wx.showToast({ title: '下载失败:' + (err.errMsg||'未知'), icon: 'none', duration: 3000 }); that.setData({ voicePlaying: false }); }
    });
  },

  toggleVoicePlay() {
    var audio = this.data.voiceAudio;
    if (!audio) { this.playVoice(); return; }
    if (this.data.voicePlaying) { audio.pause(); }
    else if (this.data.voicePaused) { audio.play(); this.setData({ voicePlaying: true, voicePaused: false }); }
  },

  clearTimers() { var t = this.data.voiceTimers; if (t && t.length) { t.forEach(function (x) { clearTimeout(x); }); this.setData({ voiceTimers: [] }); } },
  scheduleWords(startIdx) {
    var that = this;
    that.clearTimers();
    var words = that.data.voiceWords;
    if (!words.length) return;
    var timers = [];
    for (var i = startIdx; i < words.length; i++) {
      (function(idx) {
        var delay = words[idx].start_ms;
        var timer = setTimeout(function () { that.setData({ voiceHighlightIdx: idx }); }, delay);
        timers.push(timer);
      })(i);
    }
    that.setData({ voiceTimers: timers });
  },

  onHide() {
    var audio = this.data.voiceAudio;
    if (audio && this.data.voicePlaying) {
      audio.pause();
    }
  },

  // ==================== 公式推导 ====================
  quickFormula(e) {
    var formula = e.currentTarget.dataset.f;
    this.setData({ formulaContent: formula });
    this.deriveFormula();
  },

  onFormulaInput(e) {
    this.setData({ formulaContent: e.detail.value });
  },

  deriveFormula() {
    var that = this;
    var formula = (that.data.formulaContent || '').trim();
    if (!formula) { wx.showToast({ title: '请输入公式名称', icon: 'none' }); return; }

    var fullPrompt = FORMULA_PROMPT + '\n目标公式：' + formula;
    that.setData({ formulaLoading: true, formulaResult: '', formulaNodes: [] });

    app.request({
      url: '' + app.globalData.apiBase + '/api/chat',
      method: 'POST',
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      data: 'question=' + encodeURIComponent(formula) + '&prompt=' + encodeURIComponent(fullPrompt) + '&rules=' + encodeURIComponent(app.getFullRules()) + '&user_id=' + encodeURIComponent(app.getUserId()),
      timeout: 45000,
      success: function (res) {
        if (res.data && res.data.code === 200) {
          var text = res.data.answer;
          that.setData({ formulaResult: text, formulaNodes: app.smartParseLines(text), formulaLoading: false });
        } else {
          wx.showToast({ title: '推导失败，请重试', icon: 'none' });
          that.setData({ formulaLoading: false });
        }
      },
      fail: function () {
        wx.showToast({ title: '网络异常，请检查连接', icon: 'none' });
        that.setData({ formulaLoading: false });
      }
    });
  }
});
