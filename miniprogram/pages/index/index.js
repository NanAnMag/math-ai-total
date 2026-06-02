var app = getApp();

Page({
  data: { overview: {}, user: null },

  onShow() {
    // 先用本地数据显示，不阻塞渲染
    var user = wx.getStorageSync('user');
    this.refreshOverview();
    this.setData({ user: user });
    // 后台从云端同步
    if (user && user.user_id) {
      var that = this;
      app.syncLoad(function () { that.refreshOverview(); });
    }
  },

  refreshOverview() {
    var weakPoint = wx.getStorageSync('weak_point') || '';
    var level = wx.getStorageSync('mastery_level') || '';
    var errorList = wx.getStorageSync('error_list') || [];
    var shortKp = weakPoint.length > 8 ? weakPoint.substring(0, 8) + '...' : weakPoint;
    this.setData({
      overview: {
        errorCount: errorList.length,
        weakPoint: shortKp || '未诊断',
        levelText: level || '未知'
      }
    });
  },

  logout() {
    var that = this;
    wx.showModal({
      title: '确认退出',
      content: '确定退出登录吗？',
      success: function (res) {
        if (res.confirm) {
          app.syncSave();
          // 清除所有本地数据
          var keys = ['user', 'weak_point', 'mastery_level', 'error_list', 'kp_history', 'favorites', 'user_habit', 'synced_exercises', 'synced_graph', 'synced_notebook'];
          keys.forEach(function (k) { wx.removeStorageSync(k); });
          app.globalData.user = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },

  manualSync() {
    var that = this;
    wx.showLoading({ title: '同步中...' });
    app.syncLoad(function () {
      wx.hideLoading();
      that.refreshOverview();
      wx.showToast({ title: '同步完成', icon: 'success' });
    });
  },

  goToPlan() { wx.setStorageSync('open_tab', 1); wx.switchTab({ url: '/pages/resource/resource' }); },
  goToTools() { wx.navigateTo({ url: '/pages/tools/tools' }); }
});
