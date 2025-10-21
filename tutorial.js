class Tutorial {
  constructor(opts = {}) {
    this.forceOpen = !!opts.forceOpen;

    // Mostra solo alla prima apertura della sessione, a meno di "forceOpen"
    this.SS_KEY = 'cure_tutorial_seen_v3';
    if (!this.forceOpen) {
      try {
        if (sessionStorage.getItem(this.SS_KEY) === '1') return;
        sessionStorage.setItem(this.SS_KEY, '1');
      } catch (e) { /* no-op */ }
    }

    // Steps aggiornati
    // Nota: "target" può essere stringa o array di selettori; verrà usato il primo che esiste.
    this.steps = [
      // 0) Selezione Comuni
      {
        title: "Selezione Comuni",
        content: `
          <p>Qui puoi scegliere <strong>per quali comuni visualizzare</strong> i dati.</p>
          <p>Gli switch (blu) sono indipendenti dagli indicatori: puoi attivare <strong>una o più città</strong> contemporaneamente.</p>
          <p><strong>Nota:</strong> alcuni dataset sono disponibili solo per certi comuni.</p>
        `,
        targets: ["#city-toggles"],
        position: "left"
      },

      // 1) Scelta dataset (i 4 box)
      {
        title: "Scegli il dataset",
        content: `
          <p>Seleziona una delle <strong>quattro sezioni</strong>: <code>STAT_DATA</code>, <code>DEMOGRAFICA (2021)</code>, <code>DEMOGRAFICA GENERALE</code>, <code>TURISMO</code>.</p>
          <p>Si aprirà il pannello con gli <strong>ambiti</strong> e gli <strong>indicatori</strong> disponibili per quel dataset.</p>
          <p><em>Il bordo rosso sui pulsanti indica che il dataset non è disponibile per almeno uno dei comuni selezionati.</em></p>
        `,
        targets: ["#dataset-grid"],
        position: "right"
      },

      // 2) Rischi ambientali (spostato qui)
      {
        title: "Rischi ambientali (Idro/Vulcani)",
        content: `
          <p>Con gli switch (verdi) puoi attivare la sovrapposizione dei <strong>rischi ambientali</strong>:
          <em>Idro</em> (basso/medio/elevato) e <em>Vulcani</em> (zone ROSSA/GIALLA).</p>
          <p>I layer si disegnano <strong>sopra</strong> i tematismi e sono <strong>indipendenti</strong> dagli indicatori.</p>
          <p>Servono a <strong>contestualizzare</strong> i fenomeni con un quadro di pericolosità.</p>
        `,
        targets: ["#hazard-toggles"],
        position: "left"
      },

      // 3) Focus geografico (informativo)
      {
        title: "Scala geografica dei dati",
        content: `
          <p>A seconda del dataset e degli indicatori, il <strong>focus geografico</strong> cambia:</p>
          <ul>
            <li><strong>STAT_DATA</strong>: quartieri/ASC per le città abilitate;</li>
            <li><strong>DEMOGRAFICA (2021)</strong>: <em>Municipalità/ASC</em> (anno di riferimento fisso);</li>
            <li><strong>DEMOGRAFICA GENERALE</strong>: <em>comune</em> per <em>anno</em> e <em>sesso</em>;</li>
            <li><strong>TURISMO</strong>: <em>comune</em> per <em>anno</em> e popolazione di riferimento.</li>
          </ul>
        `,
        targets: [],
        position: "center"
      },

      // 4) Legenda
      {
        title: "Legenda dei valori",
        content: `
          <p>Seleziona gli indicatori: la mappa usa un <strong>gradiente di rosso</strong>, dove il massimo corrisponde al valore più alto nel dominio corrente.</p>
          <p>Le aree con valore = 0 non vengono colorate. I dettagli sul calcolo sono nella <strong>pagina Info</strong>.</p>
        `,
        targets: ["#legend"],
        position: "left"
      },

      // 5) Barra del tempo
      {
        title: "Barra del tempo",
        content: `
          <p>Usa la barra temporale per scegliere l’<strong>anno</strong> (o l’intervallo) di mappa e grafici.</p>
          <p><strong>Nota:</strong> non tutti i dataset hanno lo stesso arco temporale; p.es. <em>Demografica 2021</em> è puntuale.</p>
        `,
        targets: ["#timeline", "#timeline-container", ".timeline", ".timeline-wrapper"],
        position: "top"
      },

      // 6) Grafico Statistico
      {
        title: "Grafico Statistico",
        content: `
          <p>In <code>STAT_DATA</code> seleziona indicatori e clicca un quartiere: vedi il grafico coerente con la mappa.</p>
          <p>Con <strong>“Dettaglio Completo”</strong> hai lo spaccato del territorio.</p>
        `,
        targets: [],
        position: "center"
      },

      // 7) Grafico Demografico
      {
        title: "Grafico Demografico",
        content: `
          <p>In <code>DEMOGRAFICA (2021)</code> clicca una Municipalità per il grafico.</p>
          <p><strong>“Grafico Funzioni”</strong> mostra la distribuzione per <em>SEZ2011</em>; <strong>“Dettaglio Completo”</strong> sintetizza i valori.</p>
        `,
        targets: [],
        position: "center"
      },

      // 8) Dettaglio timeline (DEM_GEN & Turismo)
      {
        title: "Dettaglio Timeline (DEM_GEN & Turismo)",
        content: `
          <p>Pagina per le <strong>serie storiche per comune</strong>:</p>
          <ul>
            <li>selezione indicatori e range anni;</li>
            <li>filtro per <em>sesso</em> (DEM_GEN) o popolazione (Turismo);</li>
            <li>modalità <strong>%</strong> (su popolazione media) per confronti normalizzati.</li>
          </ul>
          <p>Link: <code>detail_timeline_page/index.html</code>.</p>
        `,
        targets: [],
        position: "center"
      },

      // 9) Pagina Info
      {
        title: "Per saperne di più",
        content: `
          <p>Visita la <strong>pagina informativa</strong> per fonti, formule (inclusa la normalizzazione), costruzione dei dataset e linee guida.</p>
          <p>Apribile anche dal pulsante “Further details” nella sidebar.</p>
        `,
        targets: [".sidebar-info-btn", "#sidebar .sidebar-info-btn"],
        position: "right"
      }
    ];

    this.currentStep = 0;
    this.init();
  }

  /* ---------- lifecycle ---------- */
  init() {
    this.createTutorialElements();
    this.showStep(0);
    window.addEventListener('resize', this._repositionHighlight);
    document.addEventListener('keydown', this.handleKeyPress.bind(this));
  }

  destroy() {
    window.removeEventListener('resize', this._repositionHighlight);
    document.removeEventListener('keydown', this.handleKeyPress);
    try {
      document.body.removeChild(this.overlay);
      document.body.removeChild(this.highlightBox);
      document.body.removeChild(this.tutorialBox);
    } catch {}
  }

  /* ---------- DOM scaffolding ---------- */
  createTutorialElements() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'tutorial-overlay';

    this.highlightBox = document.createElement('div');
    this.highlightBox.className = 'tutorial-highlight';

    this.tutorialBox = document.createElement('div');
    this.tutorialBox.className = 'tutorial-box';

    this.tutorialTitle = document.createElement('h3');
    this.tutorialTitle.className = 'tutorial-title';

    this.tutorialContent = document.createElement('div');
    this.tutorialContent.className = 'tutorial-content';

    this.tutorialImage = document.createElement('img');
    this.tutorialImage.className = 'tutorial-image';

    this.tutorialNav = document.createElement('div');
    this.tutorialNav.className = 'tutorial-nav';

    this.prevButton = document.createElement('button');
    this.prevButton.className = 'tutorial-button tutorial-prev';
    this.prevButton.innerHTML = '&larr; Precedente';
    this.prevButton.addEventListener('click', () => this.prevStep());

    this.nextButton = document.createElement('button');
    this.nextButton.className = 'tutorial-button tutorial-next';
    this.nextButton.innerHTML = 'Avanti &rarr;';
    this.nextButton.addEventListener('click', () => this.nextStep());

    this.closeButton = document.createElement('button');
    this.closeButton.className = 'tutorial-button tutorial-close';
    this.closeButton.innerHTML = 'Chiudi Tutorial';
    this.closeButton.addEventListener('click', () => this.close());

    this.tutorialNav.appendChild(this.prevButton);
    this.tutorialNav.appendChild(this.nextButton);
    this.tutorialNav.appendChild(this.closeButton);

    this.tutorialBox.appendChild(this.tutorialTitle);
    this.tutorialBox.appendChild(this.tutorialContent);
    this.tutorialBox.appendChild(this.tutorialImage);
    this.tutorialBox.appendChild(this.tutorialNav);

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlightBox);
    document.body.appendChild(this.tutorialBox);
  }

  /* ---------- core ---------- */
  showStep(stepIndex) {
    this.currentStep = stepIndex;
    const step = this.steps[stepIndex];

    this.tutorialTitle.textContent = step.title;
    this.tutorialContent.innerHTML = step.content;

    if (step.image) {
      this.tutorialImage.src = step.image;
      this.tutorialImage.style.display = 'block';
    } else {
      this.tutorialImage.style.display = 'none';
    }

    this.positionTutorialBox(step.position);

    const targetEl = this._resolveTarget(step);
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => this.highlightElement(targetEl), 300);
    } else {
      this.hideHighlight();
    }

    this.prevButton.disabled = stepIndex === 0;
    this.nextButton.innerHTML = stepIndex === this.steps.length - 1 ? 'Fine' : 'Avanti &rarr;';
  }

  positionTutorialBox(position) {
    const box = this.tutorialBox;
    box.style.top = '';
    box.style.bottom = '';
    box.style.left = '';
    box.style.right = '';
    box.style.transform = '';

    switch(position) {
      case 'top':
        box.style.top = '20px';
        box.style.left = '50%';
        box.style.transform = 'translateX(-50%)';
        break;
      case 'right':
        box.style.top = '50%';
        box.style.right = '20px';
        box.style.transform = 'translateY(-50%)';
        break;
      case 'left':
        box.style.top = '50%';
        box.style.left = '20px';
        box.style.transform = 'translateY(-50%)';
        break;
      case 'center':
      default:
        box.style.top = '50%';
        box.style.left = '50%';
        box.style.transform = 'translate(-50%, -50%)';
    }
  }

  highlightElement(element) {
    const rect = element.getBoundingClientRect();
    this.highlightBox.style.width = `${rect.width + 20}px`;
    this.highlightBox.style.height = `${rect.height + 20}px`;
    this.highlightBox.style.top = `${rect.top + window.scrollY - 10}px`;
    this.highlightBox.style.left = `${rect.left + window.scrollX - 10}px`;
    this.highlightBox.style.opacity = '1';

    const tutorialRect = this.tutorialBox.getBoundingClientRect();
    const highlightRect = this.highlightBox.getBoundingClientRect();
    this.highlightBox.className = 'tutorial-highlight';

    if (tutorialRect.left > highlightRect.right) {
      this.highlightBox.classList.add('arrow-right');
    } else if (tutorialRect.right < highlightRect.left) {
      this.highlightBox.classList.add('arrow-left');
    } else if (tutorialRect.top > highlightRect.bottom) {
      this.highlightBox.classList.add('arrow-bottom');
    } else {
      this.highlightBox.classList.add('arrow-top');
    }

    // salva el corrente per resize
    this._currentTargetEl = element;
  }

  hideHighlight() {
    this.highlightBox.style.opacity = '0';
    this._currentTargetEl = null;
  }

  nextStep() {
    if (this.currentStep < this.steps.length - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.close();
    }
  }

  prevStep() {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  close() {
    this.overlay.style.opacity = '0';
    this.highlightBox.style.opacity = '0';
    this.tutorialBox.style.opacity = '0';

    setTimeout(() => this.destroy(), 250);
  }

  handleKeyPress = (e) => {
    if (e.key === 'ArrowRight') this.nextStep();
    else if (e.key === 'ArrowLeft') this.prevStep();
    else if (e.key === 'Escape') this.close();
  };

  _repositionHighlight = () => {
    if (!this._currentTargetEl) return;
    this.highlightElement(this._currentTargetEl);
  };

  _resolveTarget(step) {
    // supporta step.target (stringa) o step.targets (array)
    if (step && Array.isArray(step.targets) && step.targets.length) {
      for (const sel of step.targets) {
        const el = document.querySelector(sel);
        if (el) return el;
      }
      return null;
    }
    if (step && typeof step.target === 'string') {
      return document.querySelector(step.target) || null;
    }
    return null;
  }
}

// Helper globale per aprire il tutorial on-demand
window.openCureTutorial = () => new Tutorial({ forceOpen: true });