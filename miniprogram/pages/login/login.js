var app = getApp();

Page({
  data: {
    mode: 'login',
    username: '',
    password: '',
    password2: '',
    loading: false
  },

  onLoad() {
    var user = wx.getStorageSync('user');
    if (user && user.username) {
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }); },
  onUsernameInput(e) { this.setData({ username: e.detail.value }); },
  onPasswordInput(e) { this.setData({ password: e.detail.value }); },
  onPassword2Input(e) { this.setData({ password2: e.detail.value }); },

  handleSubmit() {
    var that = this;
    var username = (that.data.username || '').trim();
    var password = (that.data.password || '').trim();

    if (!username || !password) { wx.showToast({ title: '请填写完整', icon: 'none' }); return; }
    if (that.data.mode === 'register') {
      if (password !== that.data.password2) { wx.showToast({ title: '两次密码不一致', icon: 'none' }); return; }
      if (password.length < 6) { wx.showToast({ title: '密码至少6位', icon: 'none' }); return; }
    }

    that.setData({ loading: true });

    // 优先用云函数，失败则用Python后端
    var done = false;
    var goHome = function () { if (!done) { done = true; wx.switchTab({ url: '/pages/index/index' }); } };

    if (wx.cloud) {
      wx.cloud.callFunction({
        name: that.data.mode,
        data: { username: username, password: password }
      }).then(function (res) {
        that.setData({ loading: false });
        var result = res.result;
        if (result && result.code === 200) {
          wx.setStorageSync('user', result.data);
          app.globalData.user = result.data;
          wx.showToast({ title: result.msg, icon: 'success' });
          app.syncLoad(goHome);
          setTimeout(goHome, 5000);
        } else {
          that.fallbackLogin(username, password, goHome);
        }
      }).catch(function () {
        that.fallbackLogin(username, password, goHome);
      });
    } else {
      that.fallbackLogin(username, password, goHome);
    }
  },

  fallbackLogin(username, password, goHome) {
    var that = this;
    var url = app.globalData.apiBase + '/api/' + that.data.mode;
    app.request({
      url: url, method: 'POST',
      data: 'username=' + encodeURIComponent(username) + '&password=' + encodeURIComponent(password),
      header: { 'content-type': 'application/x-www-form-urlencoded' },
      timeout: 10000,
      success: function (res) {
        that.setData({ loading: false });
        if (res.data && res.data.code === 200) {
          wx.setStorageSync('user', res.data.data);
          app.globalData.user = res.data.data;
          wx.showToast({ title: res.data.msg, icon: 'success' });
          app.syncLoad(goHome);
          setTimeout(goHome, 5000);
        } else {
          wx.showToast({ title: res.data.msg || '操作失败', icon: 'none' });
        }
      },
      fail: function () {
        that.setData({ loading: false });
        wx.showToast({ title: '网络异常', icon: 'none' });
      }
    });
  }
});
