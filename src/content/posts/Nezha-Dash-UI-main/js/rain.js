/**
 * =================================================================
 * Nezha-UI 背景下雨特效模块
 * @description 在页面背景上渲染一个持续的下雨动画。
 * =================================================================
 */

// ------------------ 下雨特效配置 ------------------
window.EnableRainEffect = true; // 是否启用背景下雨特效 (true/false)

function initRain() {
  if (!window.EnableRainEffect) return;

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "1", // 确保在背景和内容之间
  });
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  let w, h;
  let drops = [];
  let currentDropCount = 0; // 用于跟踪当前的雨滴数量

  // 新增：雨滴密度配置
  const DENSITY_FACTOR = 0.0004; // 【雨滴密度】每平方像素的雨滴数。值越大，雨越密。建议范围: 0.0002 - 0.001
  const MAX_DROPS = 4000; // 【最大雨滴数】防止在超高分辨率屏幕上因雨滴过多导致性能下降。
  const MIN_DROPS = 200; // 【最小雨滴数】确保在小屏幕上也能看到足够的雨滴效果。

  const resize = () => {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;

    // 1. 根据屏幕面积(w * h)和密度因子计算理想的雨滴数量
    const calculatedDrops = Math.floor(w * h * DENSITY_FACTOR);
    // 2. 将计算出的数量限制在最大和最小范围内
    const newDropCount = Math.max(
      MIN_DROPS,
      Math.min(calculatedDrops, MAX_DROPS)
    );

    // 3. 仅当雨滴数量需要改变时才重新生成雨滴
    if (newDropCount !== currentDropCount) {
      currentDropCount = newDropCount;
      drops = []; // 清空数组
      for (let i = 0; i < currentDropCount; i++) {
        const drop = {};
        resetDrop(drop);
        drops.push(drop);
      }
    }
  };
  window.addEventListener("resize", resize);

  function resetDrop(drop) {
    // 恢复为线条样式的属性
    const scale = Math.random() * 0.9 + 0.1;
    drop.x = Math.random() * w;
    drop.y = Math.random() * -h;

    // 【雨滴速度】恢复为您之前喜欢的速度
    drop.vy = 12 * scale + 4;
    // 【雨滴长度】
    drop.l = 15 * scale + 5;
    // 【雨滴不透明度】公式: A * scale + B。A控制不透明度随机范围(0-A)，B控制基础不透明度。
    drop.a = 0.6 * scale + 0.3; // (已调高不透明度，让雨滴更亮)
  }

  // 初始加载时调用resize来设置画布大小和雨滴
  resize();

  function animate() {
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round";
    ctx.lineWidth = 1.5; // 线条稍粗一点，渐变效果更好

    drops.forEach((drop) => {
      drop.y += drop.vy;

      if (drop.y > h) {
        resetDrop(drop);
      }

      // --- 为线条创建渐变，以模拟流淌效果 ---
      const gradient = ctx.createLinearGradient(
        drop.x,
        drop.y - drop.l, // 线条的顶部
        drop.x,
        drop.y // 线条的底部
      );
      const baseColor = "255, 255, 255"; // 雨滴的基础颜色 (RGB) - 已改为更亮的白色

      // 顶部完全透明
      gradient.addColorStop(0, `rgba(${baseColor}, 0)`);
      // 底部为雨滴本身的不透明度
      gradient.addColorStop(1, `rgba(${baseColor}, ${drop.a})`);

      // 使用渐变来绘制线条
      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(drop.x, drop.y - drop.l);
      ctx.lineTo(drop.x, drop.y);
      ctx.stroke();
    });

    requestAnimationFrame(animate);
  }
  animate();
}

// ================================================================
// 自动初始化
// ================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRain);
} else {
  initRain();
}
