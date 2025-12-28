/**
 * =================================================================
 * Nezha-UI 自定义链接图标模块
 * @description 为导航栏的自定义链接动态添加可配置的 iconfont 图标。
 * =================================================================
 */

// ------------------ 自定义链接配置 ------------------
window.CustomLinks = JSON.stringify([
  { link: "https://blog.faiz.hidns.co", name: "Blog", icon: "icon-book" },
  {
    link: "https://github.com/kamanfaiz/Nezha-Dash-UI",
    name: "Github",
    icon: "icon-github",
  },
  {
    link: "https://uptime.faiz.us.kg",
    name: "Uptime",
    icon: "icon-hourglass-start",
  },
]); // 导航栏的自定义链接 (JSON格式), 新增 icon 字段，请确保 icon值为 iconfont.css 中真实存在的 class

// ------------------ 顶部链接图标配置 ------------------
window.CustomLinkIconSize = "16px"; // 图标大小 (例如: "16px", "1.2em")
window.CustomLinkIconColor = ""; // 图标颜色 (例如: "#fff"), 留空则继承文本颜色
window.CustomLinkIconMarginRight = "1px"; // 图标与文字的间距

function initCustomLinks() {
  if (!window.CustomLinks) return;

  try {
    const links = JSON.parse(window.CustomLinks);
    if (!Array.isArray(links)) {
      console.error("CustomLinks 格式不正确，应为JSON数组。");
      return;
    }

    const observer = new MutationObserver(() => {
      links.forEach((linkInfo) => {
        if (!linkInfo.link || !linkInfo.icon) return;

        // 查找页面上所有匹配的链接
        const linkElements = document.querySelectorAll(
          `a[href="${linkInfo.link}"]`
        );

        linkElements.forEach((linkEl) => {
          // 检查是否已添加图标，防止重复
          if (linkEl.querySelector(".custom-link-icon")) return;
          // 排除音乐播放器内的链接
          if (linkEl.closest(".music-player-container")) return;

          const iconEl = document.createElement("i");
          // 添加 iconfont 基础 class 和自定义的 icon class
          iconEl.className = `iconfont ${linkInfo.icon} custom-link-icon`;

          // 应用自定义样式
          iconEl.style.fontSize = window.CustomLinkIconSize || "inherit";
          if (window.CustomLinkIconColor) {
            iconEl.style.color = window.CustomLinkIconColor;
          }
          iconEl.style.marginRight =
            window.CustomLinkIconMarginRight || "5px";

          // 将图标插入到链接文本之前
          linkEl.prepend(iconEl);
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  } catch (e) {
    console.error("初始化自定义链接图标失败:", e);
  }
}

// ================================================================
// 自动初始化
// ================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCustomLinks);
} else {
  initCustomLinks();
}
