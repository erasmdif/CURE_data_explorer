class Tutorial {
    constructor() {
        this.steps = [
            {
              title: "Sezione Statistica",
              content: `
                <p>In questa sezione puoi esplorare tutti i dati statistici disponibili per Quartieri (2021/2022). 
                Seleziona un ambito per visualizzare gli indicatori disponibili, quindi attivali tramite i checkbox per visualizzare l'entità del fenomeno sulla mappa.</p>
                <p><strong>Il dato verrà visualizzato raggruppato per Quartiere (COD_ASC2).</strong></p>
              `,
              target: "#file-section-stat_data",
              position: "right"
            },
            {
              title: "Sezione Demografica",
              content: `
                <p>Questa sezione contiene indicatori demografici disponibili alla scala della Municipalità (2021). 
                Seleziona un ambito per visualizzare gli indicatori disponibili, quindi attivali tramite i checkbox per visualizzare l'entità del fenomeno sulla mappa.</p>
                <p><strong>Il dato verrà visualizzato raggruppato per Municipalità (COD_ASC1).</strong></p>
              `,
              target: "#file-section-demografica",
              position: "right"
            },
            {
              title: "Legenda dei valori",
              content: `
                <p>L'intensità del fenomeno selezionato sulla mappa verrà visualizzato in gradiente di rosso, dove "100" corrisponde al valore massimo registrato. Aree con valore = 0 non verranno visualizzate in pianta</p>
                <p>Il valore mostrato è un rapporto tra il valore osservato in un’area e la media pesata dello stesso indicatore sull’intero dataset di riferimento.</p>
                <p><strong>Formula:</strong> 
                <code>(valore dell'indicatore nell'area / media pesata dell'indicatore) × 100</code></p>
                <p><strong>IMPORTANTE:</strong> per i dati statistici (<code>stat_data</code>), il confronto è effettuato con la media di tutti i Quartieri italiani (COD_ASC2). 
                Per i dati demografici, invece, il confronto è interno al solo Comune di Napoli (COD_ASC1).</p>
              `,
              target: "#legend",
              position: "left"
            },
            {
              title: "Grafico Statistico",
              content: `
                <p>Una volta selezionato/i uno o più indicatori dalla sezione <code>STAT_DATA</code>, 
                basterà cliccare sul Quartiere desiderato per osservare, in forma di grafico, 
                il medesimo rapporto visualizzato sulla mappa.</p>
                <p>Cliccando su <strong>“Dettaglio Completo”</strong> sarà possibile visualizzare uno spaccato completo del quartiere selezionato.</p>
              `,
              target: null,
              position: "center",
              image: "images/graph_stat.png"
            },
            {
              title: "Grafico Demografico",
              content: `
                <p>Una volta selezionato/i uno o più indicatori dalla sezione <code>DEMOGRAFICA</code>, 
                basterà cliccare sulla Municipalità desiderata per visualizzare, in forma di grafico, il rapporto rispetto alla media.</p>
                <p>Selezionando <strong>“Grafico Funzioni”</strong> sarà possibile osservare la distribuzione del fenomeno per ciascuna sezione (SEZ2011) interna alla Municipalità.</p>
                <p>Cliccando su <strong>“Dettaglio Completo”</strong> sarà invece possibile visualizzare uno spaccato sintetico e completo del territorio selezionato.</p>
              `,
              target: null,
              position: "center",
              image: "images/graph_demo.png"
            }
          ];           
      this.currentStep = 0;
      this.init();
    }
  
    init() {
      this.createTutorialElements();
      this.showStep(0);
      document.addEventListener('keydown', this.handleKeyPress.bind(this));
    }
  
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
  
      if (step.target) {
        const targetElement = document.querySelector(step.target);
        if (targetElement) {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => this.highlightElement(targetElement), 400);
        } else {
          this.hideHighlight();
        }
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
      this.highlightBox.style.top = `${rect.top - 10}px`;
      this.highlightBox.style.left = `${rect.left - 10}px`;
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
    }
  
    hideHighlight() {
      this.highlightBox.style.opacity = '0';
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
  
      setTimeout(() => {
        document.body.removeChild(this.overlay);
        document.body.removeChild(this.highlightBox);
        document.body.removeChild(this.tutorialBox);
      }, 300);
    }
  
    handleKeyPress(e) {
      if (e.key === 'ArrowRight') {
        this.nextStep();
      } else if (e.key === 'ArrowLeft') {
        this.prevStep();
      } else if (e.key === 'Escape') {
        this.close();
      }
    }
  }