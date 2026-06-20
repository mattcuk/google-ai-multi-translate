(async () => {
  // The Language Detector API uses the `self.LanguageDetector` namespace.
  if (!('LanguageDetector' in self)) {
    document.querySelector('.not-supported-message').hidden = false;
    return;
  }

  const input = document.querySelector('textarea');
  const form = document.querySelector('form');
  const detected = document.querySelector('span');
  const languagesContainer = document.getElementById('languages');
  const translateButton = document.getElementById('translate-button');
  const clearButton = document.getElementById('clear-button');
  const outputsContainer = document.getElementById('outputs-container');
  const status = document.getElementById('status');

  form.style.visibility = 'visible';
  const detector = await LanguageDetector.create();

  input.addEventListener('input', async () => {
    if (!input.value.trim()) {
      detected.textContent = 'not sure what language this is';
      return;
    }
    const { detectedLanguage, confidence } = (
      await detector.detect(input.value.trim())
    )[0];
    detected.textContent = `${(confidence * 100).toFixed(
      1
    )}% sure that this is ${languageTagToHumanReadable(
      detectedLanguage,
      'en'
    )}`;
  });

  input.dispatchEvent(new Event('input'));

  const languageTagToHumanReadable = (languageTag, targetLanguage) => {
    const displayNames = new Intl.DisplayNames([targetLanguage], {
      type: 'language',
    });
    return displayNames.of(languageTag);
  };

  if ('Translator' in self) {
    document.querySelectorAll('[hidden]:not(.not-supported-message)').forEach((el) => {
      el.removeAttribute('hidden');
    });

    // Full list of supported language codes. Intl.DisplayNames will render readable labels.
    const FULL_LANG_CODES = [
      'af','sq','am','ar','hy','az','eu','be','bn','bs','bg','ca','ceb','zh','zh-CN','zh-TW','co','hr','cs','da','nl','en','eo','et','fi','fr','fy','gl','ka','de','el','gu','ht','ha','haw','he','hi','hmn','hu','is','ig','id','ga','it','ja','jw','kn','kk','km','ko','ku','ky','lo','la','lv','lt','lb','mk','mg','ms','ml','mt','mi','mr','mn','my','ne','no','ny','or','ps','fa','pl','pt','pa','ro','ru','sm','gd','sr','st','sn','sd','si','sk','sl','so','es','su','sw','sv','tg','ta','te','th','tr','uk','ur','uz','vi','cy','xh','yi','yo','zu'
    ];

    const cookieName = 'gai_selected_langs';

    function getCookie(name) {
      const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
      return m ? decodeURIComponent(m.pop()) : '';
    }

    function setCookie(name, value, days = 365) {
      const d = new Date();
      d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
      document.cookie = `${name}=${encodeURIComponent(value)};expires=${d.toUTCString()};path=/`;
    }

    const displayNames = new Intl.DisplayNames(['en'], { type: 'language' });
    const getHumanName = (code) => displayNames.of(code) || code;

    async function copyTextToClipboard(text) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (err) {
        console.error('Clipboard write failed', err);
        return false;
      }
    }

    async function createTranslatorWithProgress(sourceLanguage, targetLanguage, outputArea) {
      let lastProgress = -1;
      return await Translator.create({
        sourceLanguage,
        targetLanguage,
        monitor(monitor) {
          monitor.addEventListener('downloadprogress', (event) => {
            const percent = Math.min(100, Math.round(event.loaded * 100));
            if (percent !== lastProgress) {
              lastProgress = percent;
              status.textContent = `Installing ${getHumanName(targetLanguage)} language pack: ${percent}%`;
              if (outputArea) {
                outputArea.value = `Downloading language pack (${percent}%)...`;
              }
            }
          });
        },
      });
    }

    // Group languages: common European first, then the rest alphabetically by display name
    const COMMON_EU = ['en','fr','de','es','it','pt','nl','sv','da','no','fi','pl','cs','sk','hu','ro','bg','el','hr','sr'];
    const rest = FULL_LANG_CODES.filter(c => !COMMON_EU.includes(c)).sort((a,b) => {
      const na = getHumanName(a);
      const nb = getHumanName(b);
      return na.localeCompare(nb);
    });
    const SUPPORTED_LANG_CODES = [...COMMON_EU.filter(c => FULL_LANG_CODES.includes(c)), ...rest];

    // Build the language checklist UI
    SUPPORTED_LANG_CODES.forEach((code) => {
      const id = `lang-${code.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const wrapper = document.createElement('label');
      wrapper.className = 'lang-item';
      wrapper.setAttribute('for', id);

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.id = id;
      cb.value = code;

      const nameSpan = document.createElement('span');
      const pretty = displayNames.of(code) || code;
      nameSpan.textContent = pretty;

      wrapper.appendChild(cb);
      wrapper.appendChild(nameSpan);
      languagesContainer.appendChild(wrapper);
    });

    // Restore selections from cookie
    try {
      const saved = getCookie(cookieName);
      if (saved) {
        const arr = JSON.parse(saved);
        arr.forEach((c) => {
          const el = languagesContainer.querySelector(`input[value="${c}"]`);
          if (el) el.checked = true;
        });
      }
    } catch (e) {
      console.warn('Could not parse saved languages cookie', e);
    }

    // Save cookie on change
    languagesContainer.addEventListener('change', () => {
      const vals = Array.from(languagesContainer.querySelectorAll('input:checked')).map((i) => i.value);
      setCookie(cookieName, JSON.stringify(vals));
    });

    // Clear button handler: uncheck all, clear outputs and cookie
    clearButton.addEventListener('click', () => {
      languagesContainer.querySelectorAll('input:checked').forEach((cb) => (cb.checked = false));
      setCookie(cookieName, JSON.stringify([]));
      outputsContainer.innerHTML = '';
      status.textContent = '';
    });

    // Handle translate button click: sequentially translate into each selected language.
    translateButton.addEventListener('click', async () => {
      const selected = Array.from(languagesContainer.querySelectorAll('input:checked')).map((i) => i.value);
      outputsContainer.innerHTML = '';
      status.textContent = '';
      if (!input.value.trim()) {
        const note = document.createElement('div');
        note.textContent = 'Please enter text to translate.';
        outputsContainer.appendChild(note);
        return;
      }

      if (selected.length === 0) {
        const note = document.createElement('div');
        note.textContent = 'Please choose at least one target language.';
        outputsContainer.appendChild(note);
        return;
      }

      translateButton.disabled = true;
      status.textContent = `Translating 0 / ${selected.length}`;
      const sourceLanguage = (await detector.detect(input.value.trim()))[0].detectedLanguage;
      let idx = 0;

      try {
        for (const targetLanguage of selected) {
          const container = document.createElement('div');
          const header = document.createElement('div');
          header.className = 'output-header';

          const heading = document.createElement('div');
          heading.textContent = `${displayNames.of(targetLanguage) || targetLanguage} (${targetLanguage})`;

          const copyButton = document.createElement('button');
          copyButton.type = 'button';
          copyButton.className = 'copy-button';
          copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
          copyButton.setAttribute('aria-label', 'Copy translation');
          copyButton.title = 'Copy translation';
          copyButton.disabled = true;

          header.appendChild(heading);
          header.appendChild(copyButton);

          const ta = document.createElement('textarea');
          ta.className = 'translation-output';
          ta.readOnly = false;
          ta.value = 'Translating...';

          copyButton.addEventListener('click', async () => {
            const success = await copyTextToClipboard(ta.value);
            if (success) {
              copyButton.title = 'Copied!';
              copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
              setTimeout(() => {
                copyButton.title = 'Copy translation';
                copyButton.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>';
              }, 1200);
            } else {
              copyButton.title = 'Retry copy';
            }
          });

          container.appendChild(header);
          container.appendChild(ta);
          outputsContainer.appendChild(container);

          idx += 1;
          status.textContent = `Translating ${idx} / ${selected.length}`;

          try {
            const availability = await Translator.availability({ sourceLanguage, targetLanguage });
            if (availability === 'unavailable') {
              ta.value = `${languageTagToHumanReadable(sourceLanguage, 'en') || sourceLanguage} - ${languageTagToHumanReadable(targetLanguage, 'en') || targetLanguage} pair is not supported.`;
              continue;
            }

            if (availability === 'downloadable') {
              status.textContent = `Preparing ${getHumanName(targetLanguage)} language pack...`;
              ta.value = `Waiting for ${getHumanName(targetLanguage)} pack to install...`;
            }

            const translator = await createTranslatorWithProgress(sourceLanguage, targetLanguage, ta);
            status.textContent = `Translating ${getHumanName(targetLanguage)}...`;
            const translated = await translator.translate(input.value.trim());
            ta.value = translated;
            copyButton.disabled = false;
          } catch (err) {
            if (err.name === 'NotSupportedError' || err.message?.includes('download')) {
              ta.value = `The language pack for ${getHumanName(targetLanguage)} is not yet available or failed to install.`;
            } else if (err.name === 'AbortError') {
              ta.value = `The translation for ${getHumanName(targetLanguage)} was interrupted.`;
            } else {
              ta.value = 'An error occurred while translating.';
            }
            console.error(err);
          }
        }
      } finally {
        translateButton.disabled = false;
        status.textContent = `Completed ${selected.length} translation${selected.length === 1 ? '' : 's'}.`;
      }
    });
  }
})();