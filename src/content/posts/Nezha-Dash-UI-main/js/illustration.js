/**
 * =================================================================
 * Nezha-UI 插图插入模块
 * @description 异步加载并插入自定义插图，代码更紧凑。
 * =================================================================
 */

function initIllustration() {
  if (!window.CustomIllustration || window.CustomIllustration.trim() === "")
    return;

  // 最简单直接的实现
  const img = new Image();

  // 插图样式设置函数
  const setupIllustration = () => {
    img.style.position = "absolute";
    img.style.right = "-10px";
    img.style.top = "-120px";
    img.style.zIndex = "10";
    img.style.width = "120px";
    img.style.transition =
      "opacity 0.4s ease-in-out, transform 0.4s ease-in-out"; // 减少过渡时间为0.4秒，让动画更快
    img.style.opacity = "0";
    img.style.transform = "translateY(20px)"; // 初始位置稍微下移

    // 为了在DevTools中方便找到元素
    img.className = "custom-illustration";
    img.id = "nezha-custom-illustration";
  };

  // 为容器添加插图
  const attachToContainer = (container) => {
    if (!container) return false;

    // 确保容器有相对定位
    container.style.position = "relative";

    // 移除可能存在的旧插图
    const existing = document.getElementById("nezha-custom-illustration");
    if (existing) existing.remove();

    // 添加新插图
    container.appendChild(img);

    // 使用requestAnimationFrame确保渲染
    requestAnimationFrame(() => {
      // 延迟一帧执行，确保浏览器有时间应用初始样式
      requestAnimationFrame(() => {
        img.style.opacity = "1";
        img.style.transform = "translateY(0)"; // 平滑移动到目标位置
      });
    });

    return true;
  };

  // 尝试使用多种方法查找容器
  const findAndAttach = () => {
    // 1. 使用XPath查找 - 最可靠的定位方式
    try {
      const xpaths = [
        "/html/body/div/div/main/div[2]/section[1]/div[4]/div", // 原始XPath
        "//section[contains(@class,'section')]/div[last()]/div", // 带section的备选
        "//div[contains(@class,'server-cards-container')]/div[last()]", // 服务器卡片容器
      ];

      for (const xpath of xpaths) {
        const result = document.evaluate(
          xpath,
          document,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        ).singleNodeValue;

        if (result && attachToContainer(result)) {
          return true;
        }
      }
    } catch (e) {
      // XPath查找失败，继续尝试其他方法
    }

    // 2. 使用选择器查找
    const selectors = [
      ".server-cards-container > div:last-child",
      ".section > div:last-child > div",
      ".card:last-child",
    ];

    for (const selector of selectors) {
      const container = document.querySelector(selector);
      if (container && attachToContainer(container)) {
        return true;
      }
    }

    // 3. 尝试直接添加到已知父容器
    const parents = [
      document.querySelector(".server-cards-container"),
      document.querySelector(".section"),
    ];

    for (const parent of parents) {
      if (parent) {
        // 在父容器的最后添加一个新的div作为插图容器
        const newContainer = document.createElement("div");
        newContainer.style.position = "relative";
        parent.appendChild(newContainer);

        if (attachToContainer(newContainer)) {
          return true;
        }
      }
    }

    return false;
  };

  // 预设置插图样式
  setupIllustration();

  // 图片加载完成后执行
  img.onload = () => {
    // 先尝试一次直接查找并添加
    if (findAndAttach()) return;

    // 如果失败，设置多次重试
    let retries = 0;
    const maxRetries = 5;
    const retryInterval = 800; // 800ms间隔

    const tryAttach = () => {
      if (findAndAttach()) return;

      retries++;
      if (retries < maxRetries) {
        setTimeout(tryAttach, retryInterval);
      }
    };

    // 开始重试
    setTimeout(tryAttach, retryInterval);
  };

  // 设置图片源
  img.src = window.CustomIllustration;

  // 确保页面加载完成后也会尝试
  window.addEventListener("load", () => {
    setTimeout(() => {
      findAndAttach();
    }, 1000);
  });

  // 新增：监听DOM变化，用于在从服务器详情页返回时重新添加插图
  const domObserver = new MutationObserver((mutations) => {
    // 检查是否有服务器卡片容器相关的变化
    const relevantMutations = mutations.some((mutation) => {
      // 检查新增的节点是否包含服务器卡片容器
      if (mutation.addedNodes.length) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (
              node.classList?.contains("server-cards-container") ||
              node.querySelector?.(".server-cards-container") ||
              node.classList?.contains("section") ||
              node.querySelector?.(".section")
            ) {
              return true;
            }
          }
        }
      }

      // 检查修改的属性是否可能影响布局
      if (
        mutation.type === "attributes" &&
        (mutation.attributeName === "class" ||
          mutation.attributeName === "style")
      ) {
        const target = mutation.target;
        if (
          target.classList?.contains("server-cards-container") ||
          target.closest?.(".server-cards-container") ||
          target.classList?.contains("section") ||
          target.closest?.(".section")
        ) {
          return true;
        }
      }

      return false;
    });

    if (relevantMutations) {
      // 延迟执行，确保DOM已经完全更新
      setTimeout(() => {
        // 检查插图是否已存在
        const existing = document.getElementById("nezha-custom-illustration");
        if (!existing || existing.offsetParent === null) {
          // 插图不存在或不可见，尝试重新添加
          // 先移除可能存在但不可见的旧插图
          if (existing) existing.remove();

          // 确保新插图有完整的动画效果
          const newImg = new Image();
          newImg.src = img.src;
          newImg.onload = () => {
            // 复制原始插图的所有样式设置
            setupIllustration();
            img.style.opacity = "0";
            img.style.transform = "translateY(20px)";
            findAndAttach();
          };
        }
      }, 300);
    }
  });

  // 配置观察器选项
  const observerOptions = {
    childList: true, // 观察子节点变化
    subtree: true, // 观察所有后代节点
    attributes: true, // 观察属性变化
  };

  // 开始观察整个文档
  domObserver.observe(document.body, observerOptions);

  // 监听路由变化（针对单页应用）
  window.addEventListener("popstate", () => {
    // 先重置插图状态以确保动画效果
    img.style.opacity = "0";
    img.style.transform = "translateY(20px)";
    setTimeout(() => findAndAttach(), 150); // 减少延迟时间为150ms，让动画更快开始
  });

  // 监听哈希变化（针对使用hash路由的应用）
  window.addEventListener("hashchange", () => {
    // 先重置插图状态以确保动画效果
    img.style.opacity = "0";
    img.style.transform = "translateY(20px)";
    setTimeout(() => findAndAttach(), 150); // 减少延迟时间为150ms，让动画更快开始
  });
}

// ================================================================
// 自动初始化
// ================================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initIllustration);
} else {
  initIllustration();
}
