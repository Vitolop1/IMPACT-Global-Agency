(() => {
  const form = document.querySelector('#leadForm');
  const labels = { name: 'studentName', parent: 'parent', email: 'email', age: 'age', graduation: 'graduation', path: 'path', sport: 'sport', english: 'english', budget: 'budget', notes: 'notes' };
  for (const [id, key] of Object.entries(labels)) document.querySelector(`label[for="${id}"]`).dataset.ui = key;
  for (const [id, key] of Object.entries({ graduation: 'graduationHint', sport: 'sportHint', notes: 'notesHint' })) document.getElementById(id).dataset.uiPlaceholder = key;
  const options = { path: ['choose', 'sports', 'academic', 'cultural', 'exchange', 'undecided'], english: ['choose', 'basic', 'intermediate', 'advanced', 'tested'], budget: ['choose', 'budget10', 'budget20', 'budget30', 'budget45', 'discuss'] };
  for (const [id, keys] of Object.entries(options)) {
    [...document.getElementById(id).options].forEach((option, index) => {
      option.value = index === 0 ? '' : keys[index];
      option.dataset.ui = keys[index];
    });
  }
  document.querySelector('#age option').dataset.ui = 'choose';
  document.querySelector('.choices').previousElementSibling.dataset.ui = 'stage';
  document.querySelectorAll('.choice span').forEach((el, i) => { el.dataset.ui = ['explore', 'evaluate', 'applySoon'][i]; });
  form.querySelector('[type=submit]').dataset.ui = 'buildMessage';
  form.querySelector('[type=reset]').dataset.ui = 'clear';
  document.querySelector('#menuToggle').dataset.uiLabel = 'menu';
  document.querySelector('.lang-switch').dataset.uiLabel = 'changeLanguage';
  document.querySelector('#phone').type = 'tel';
  document.querySelector('#name').autocomplete = 'name';
  document.querySelector('#email').autocomplete = 'email';
  document.querySelector('#phone').autocomplete = 'tel';
  const root = document.documentElement;
  const strip = document.querySelector('.top-strip');
  const header = document.querySelector('#siteHeader');
  function measureHeader() {
    const stripHeight = strip.getBoundingClientRect().height;
    root.style.setProperty('--strip-height', `${stripHeight}px`);
    root.style.setProperty('--header-offset', `${stripHeight + header.getBoundingClientRect().height}px`);
  }
  new ResizeObserver(measureHeader).observe(header);
  new ResizeObserver(measureHeader).observe(strip);
  measureHeader();
})();
