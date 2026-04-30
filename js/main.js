// ========================================
// AI中药鉴定 - 公共脚本
// ========================================

// 导航栏滚动效果
const navbar = document.querySelector('.navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 20) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// 移动端菜单切换
const navToggle = document.querySelector('.nav-toggle');
const navLinks = document.querySelector('.nav-links');
if (navToggle) {
  navToggle.addEventListener('click', () => {
    navLinks.classList.toggle('open');
    const spans = navToggle.querySelectorAll('span');
    if (navLinks.classList.contains('open')) {
      spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
      spans[1].style.opacity = '0';
      spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
    } else {
      spans[0].style.transform = '';
      spans[1].style.opacity = '';
      spans[2].style.transform = '';
    }
  });
}

// 滚动触发动画 (Intersection Observer)
const revealElements = document.querySelectorAll('.reveal');
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

revealElements.forEach(el => revealObserver.observe(el));

// 数字滚动动画
function animateCounter(element, target, duration = 2000) {
  let start = 0;
  const step = target / (duration / 16);
  const isFloat = String(target).includes('.');
  const timer = setInterval(() => {
    start += step;
    if (start >= target) {
      start = target;
      clearInterval(timer);
    }
    element.textContent = isFloat ? start.toFixed(1) : Math.floor(start).toLocaleString();
  }, 16);
}

// 页面平滑滚动到锚点
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

// 通用 toast 提示
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%) translateY(20px);
    padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500;
    z-index: 9999; opacity: 0; transition: all 0.3s ease;
    ${type === 'success' ? 'background: #059669; color: white;' : 
      type === 'error' ? 'background: #DC2626; color: white;' : 
      'background: #2563EB; color: white;'}
  `;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// 药性分类工具
const herbCategories = {
  '解表药': { color: '#3B82F6', desc: '发散风寒、风热' },
  '清热药': { color: '#06B6D4', desc: '清热泻火、凉血解毒' },
  '泻下药': { color: '#8B5CF6', desc: '通利大便、排除积滞' },
  '祛风湿药': { color: '#10B981', desc: '祛除风寒湿邪' },
  '化湿药': { color: '#F59E0B', desc: '化湿醒脾' },
  '利水渗湿药': { color: '#14B8A6', desc: '通利水道、渗泄水湿' },
  '温里药': { color: '#EF4444', desc: '温里散寒' },
  '理气药': { color: '#F97316', desc: '疏畅气机' },
  '消食药': { color: '#84CC16', desc: '消化食积' },
  '止血药': { color: '#EC4899', desc: '制止体内外出血' },
  '活血化瘀药': { color: '#DC2626', desc: '通畅血行、消除瘀血' },
  '化痰止咳药': { color: '#6366F1', desc: '化痰止咳平喘' },
  '安神药': { color: '#7C3AED', desc: '安定神志' },
  '补虚药': { color: '#D97706', desc: '补益气血阴阳' }
};
