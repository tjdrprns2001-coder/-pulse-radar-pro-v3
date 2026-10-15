/* PulseRadar unified analyst navigation: standalone, no API calls or external dependencies. */
(function () {
  'use strict';
  if (typeof document === 'undefined' || document.getElementById('pr-analyst-nav')) return;
  var modules = [
    { group: '개요', label: '통합 관제', path: '/workbench.html', keywords: '홈 통합 분석' },
    { group: '개요', label: '시장 홈', path: '/', keywords: '실시간 시세 현물 선물' },
    { group: '스캔', label: 'Astra 전체 스캔', path: '/astra-scan.html', keywords: '전종목 멀티시간봉 OI' },
    { group: '스캔', label: 'DNA 급등 전 스캔', path: '/dna-scan.html', keywords: '조기 포착 패턴 샘플' },
    { group: '스캔', label: '시장 레이더', path: '/radar.html', keywords: '수급 알림' },
    { group: '차트 분석', label: '종합 리포트', path: '/coin-report.html', keywords: '보고서 증거' },
    { group: '차트 분석', label: 'Auto Chart Lab', path: '/auto-chart-lab.html', keywords: '차트 10TF 기술적 분석' },
    { group: '차트 분석', label: 'ICT / ChartBro', path: '/ict-narrative-lab.html', keywords: 'FVG OB 스윕 유동성' },
    { group: '차트 분석', label: '112·224·448', path: '/dante-lab.html?method=ma-cloud-cycle', keywords: '단테 일목 구름대 밥그릇' },
    { group: '차트 분석', label: '급등 패턴', path: '/surge-pattern-lab.html', keywords: '압축 돌파 오탐' },
    { group: '차트 분석', label: '초기 거래 이력', path: '/launch-origin.html', keywords: '온체인 DEX' },
    { group: '연구·검증', label: 'Research AI', path: '/research-ai.html', keywords: '학습 검증 연구' },
    { group: '연구·검증', label: '과거·전진 검증', path: '/historical-validation.html', keywords: 'OOS 백테스트' },
    { group: '연구·검증', label: 'Pulse AI', path: '/pulse-ai.html', keywords: 'AI 전문가 보고' }
  ];
  function init() {
    if (document.getElementById('pr-analyst-nav')) return;
    var head = document.head || document.getElementsByTagName('head')[0];
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = '/ui/analyst-nav.css?v=20261015';
    head.appendChild(css);
    var currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
    var symbol = (new URLSearchParams(window.location.search)).get('symbol');
    symbol = symbol && /^[A-Za-z0-9]{2,24}$/.test(symbol) ? symbol.toUpperCase() : '';
    var root = document.createElement('div');
    root.id = 'pr-analyst-nav';
    var toggle = document.createElement('button');
    toggle.className = 'pr-an-toggle';
    toggle.type = 'button';
    toggle.textContent = '☰  분석 메뉴';
    toggle.setAttribute('aria-controls', 'pr-an-panel');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', 'PulseRadar 통합 분석 메뉴 열기');
    var panel = document.createElement('nav');
    panel.id = 'pr-an-panel';
    panel.className = 'pr-an-panel';
    panel.setAttribute('aria-label', 'PulseRadar 전체 분석 모듈');
    panel.hidden = true;
    var bar = document.createElement('div');
    bar.className = 'pr-an-head';
    var title = document.createElement('strong');
    title.textContent = 'PulseRadar · 통합 메뉴';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'pr-an-close';
    close.textContent = '닫기 ×';
    close.setAttribute('aria-label', '통합 메뉴 닫기');
    bar.append(title, close);
    var search = document.createElement('input');
    search.className = 'pr-an-search';
    search.type = 'search';
    search.placeholder = '기능 검색 · OI, DNA, 차트…';
    search.setAttribute('aria-label', '통합 메뉴 검색');
    var list = document.createElement('div');
    list.className = 'pr-an-list';
    var matches = document.createElement('span');
    matches.className = 'pr-an-count';
    matches.setAttribute('aria-live', 'polite');
    panel.append(bar, search, list, matches);
    root.append(panel, toggle);
    document.body.appendChild(root);
    var entries = [], lastGroup = '';
    modules.forEach(function (entry) {
      if (entry.group !== lastGroup) {
        var label = document.createElement('div');
        label.className = 'pr-an-group';
        label.textContent = entry.group;
        list.appendChild(label);
        entries.push({ group: true, node: label, name: entry.group });
        lastGroup = entry.group;
      }
      var a = document.createElement('a');
      a.className = 'pr-an-item';
      a.textContent = entry.label;
      var url = new URL(entry.path, window.location.origin);
      if (symbol && url.pathname !== '/') url.searchParams.set('symbol', symbol);
      a.href = url.pathname + url.search;
      if (url.pathname === currentPath) {
        a.setAttribute('aria-current', 'page');
        a.textContent += ' · 현재';
      }
      list.appendChild(a);
      entries.push({ group: false, node: a, name: (entry.label + ' ' + entry.keywords).toLocaleLowerCase() });
    });
    function filter() {
      var term = search.value.trim().toLocaleLowerCase();
      var visibleCount = 0, groupCount = {};
      entries.forEach(function (entry) {
        if (entry.group) return;
        var visible = !term || entry.name.includes(term);
        entry.node.hidden = !visible;
        if (visible) {
          visibleCount++;
          var previous = entry.node.previousElementSibling;
          while (previous && !previous.classList.contains('pr-an-group')) previous = previous.previousElementSibling;
          if (previous) groupCount[previous.textContent] = true;
        }
      });
      entries.forEach(function (entry) {
        if (entry.group) entry.node.hidden = !groupCount[entry.name];
      });
      matches.textContent = visibleCount ? visibleCount + '개 분석 메뉴' : '검색 결과가 없습니다';
    }
    function setOpen(open) {
      panel.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'PulseRadar 통합 분석 메뉴 닫기' : 'PulseRadar 통합 분석 메뉴 열기');
      if (open) {
        filter();
        search.focus();
      } else if (panel.contains(document.activeElement)) {
        toggle.focus();
      }
    }
    search.addEventListener('input', filter);
    toggle.addEventListener('click', function () { setOpen(panel.hidden); });
    close.addEventListener('click', function () { setOpen(false); });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !panel.hidden) setOpen(false);
    });
    document.addEventListener('pointerdown', function (event) {
      if (!panel.hidden && !root.contains(event.target)) setOpen(false);
    });
    filter();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
