/**
 * it.js — Italian locale.
 *
 * ⚠️ DRAFT — pending native-speaker review.
 * Tone: concise, impersonal/formal register typical of Italian software UI.
 * Format names (JPEG, WebP…), brand names, and EXIF are kept untranslated.
 * Keep this key tree in sync with en.js.
 */
export default {
  header: {
    tagline: 'Strumenti privati per immagini e PDF nel browser — nulla lascia il tuo dispositivo.',
    helpTitle: 'Aiuto e novità',
    helpAria: 'Aiuto e novità',
    themeTitle: 'Attiva/disattiva modalità scura',
    themeAria: 'Attiva/disattiva modalità scura',
    langTitle: 'Lingua',
    langAria: 'Scegli la lingua',
  },

  errs: {
    summary: {
      one: 'Si è verificato un problema — {count} errore registrato.',
      other: 'Si è verificato un problema — {count} errori registrati.',
    },
    details: 'Dettagli',
    hideDetails: 'Nascondi',
    report: 'Invia report',
    dismiss: 'Chiudi',
  },

  step1: { title: 'Aggiungi immagini' },

  dropzone: {
    aria: 'Trascina qui immagini o PDF, oppure clicca per selezionarli. Accetta file JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF e PDF.',
    text: 'Trascina qui immagini o PDF',
    hint: 'oppure clicca per selezionarli',
    formats: 'JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF, PDF',
    fileInputAria: 'Scegli file immagine o PDF',
  },

  pdf: {
    dialogAria: 'Modifica PDF',
    title: 'Ottimizza PDF',
    close: 'Chiudi',
    closeAria: 'Chiudi l’ottimizzatore PDF',
    back: 'Torna ai file',
    backAria: 'Torna ai tuoi file',
    edit: {
      rotateLeft: 'Ruota a sinistra',
      rotateRight: 'Ruota a destra',
      delete: 'Elimina',
      errDeleteAll: 'Impossibile eliminare tutte le pagine.',
      reset: 'Ripristina',
      export: 'Esporta',
      apply: 'Applica',
      applying: 'Applicazione delle modifiche…',
      exporting: 'Preparazione dell’esportazione…',
      preflight: '{kept} di {total} pagine · {rotated} ruotate · originale invariato',
    },
    loading: 'Lettura del PDF…',
    pages: { one: '{count} pagina', other: '{count} pagine' },
    textPreserved: 'Testo preservato',
    textPreservedHint:
      'Questo PDF ha un livello di testo: resta selezionabile dopo l’ottimizzazione.',
    prevPage: 'Pagina precedente',
    nextPage: 'Pagina successiva',
    pageOf: 'Pagina {n} di {total}',
    previewAlt: 'Anteprima della pagina {n}',
    previewFail: 'Anteprima non disponibile',
    presetsAria: 'Livello di compressione',
    preset: { email: 'Email', web: 'Web', max: 'Qualità max' },
    advanced: 'Avanzate',
    quality: 'Qualità immagini',
    opt: {
      recompress: 'Ricomprimi le immagini',
      stripMeta: 'Rimuovi i metadati',
      subsetFonts: 'Sottoinsieme dei font',
      garbage: 'Pulizia oggetti',
    },
    optimize: 'Ottimizza',
    optimizing: 'Ottimizzazione…',
    progress: 'Ottimizzazione immagini… {done}/{total}',
    download: 'Scarica',
    result: '{from} → {to} · {pct}% in meno',
    noReduction: 'Già ottimizzato — nessuna riduzione ulteriore.',
    onePerRun: 'Un PDF alla volta — ottimizzo il primo; gli altri sono stati ignorati.',
    errorRead: 'Impossibile leggere questo file PDF.',
    errorEngine: 'Caricamento del motore PDF non riuscito.',
    errorGeneric: 'Si è verificato un problema durante l’ottimizzazione del PDF.',
    errorUnsupported: 'L’ottimizzazione PDF non è disponibile in questa versione.',
    errorTimeout: 'Lo strumento PDF non risponde più. Riprova.',
    errorNotPdf: '“{name}” non è un file PDF valido.',
    errorEmpty: 'Questo PDF non ha pagine.',
    modeAria: 'Scegli cosa fare con questo PDF',
    mode: { compress: 'Comprimi', organize: 'Organizza', merge: 'Unisci', toImages: 'In immagini' },
    org: {
      operation: 'Operazione',
      opExtract: 'Estrai le pagine selezionate',
      opRemove: 'Rimuovi le pagine selezionate',
      opSplit: 'Dividi in più file',
      hint: {
        extract: 'Seleziona le pagine da includere nel nuovo PDF.',
        remove: 'Seleziona le pagine da rimuovere — le altre vengono mantenute.',
        split: 'Scegli come dividere il file qui sotto.',
      },
      selectAll: 'Seleziona tutte',
      clear: 'Deseleziona',
      selectedCount: { one: '{count} pagina selezionata', other: '{count} pagine selezionate' },
      pageLabel: 'Pagina {n}',
      splitMode: 'Divisione',
      splitEach: 'Ogni pagina separatamente',
      splitRanges: 'Intervalli personalizzati',
      ranges: 'Intervalli',
      rangesHint: 'es. 1-3, 5, 8-10',
      build: 'Crea',
      buildOp: { extract: 'Estrai le pagine', remove: 'Rimuovi le pagine', split: 'Dividi il PDF' },
      building: 'Creazione…',
      doneSingle: {
        one: 'Fatto — {count} pagina · {size}',
        other: 'Fatto — {count} pagine · {size}',
      },
      doneSplit: { one: 'Fatto — {count} file · {size}', other: 'Fatto — {count} file · {size}' },
      errNoSelection: 'Seleziona prima almeno una pagina.',
      errRemoveAll: 'Verrebbero rimosse tutte le pagine — lasciane almeno una.',
      errSplitOne: 'Questo PDF ha una sola pagina — non c’è nulla da dividere.',
      errRanges: 'Inserisci intervalli come “1-3, 5, 8-10”.',
      errRangeOob: 'Gli intervalli devono essere compresi tra 1 e {total}.',
    },
    merge: {
      hint: 'Aggiungi i PDF e ordinali — verranno uniti dall’alto in basso in un unico file.',
      summary: 'Unione di {files} PDF · {pages} pagine totali.',
      add: '+ Aggiungi PDF',
      build: 'Unisci i PDF',
      building: 'Unione…',
      moveUp: 'Sposta su',
      moveDown: 'Sposta giù',
      remove: 'Rimuovi {name}',
      removeShort: 'Rimuovi',
      reading: 'Lettura dei PDF…',
      done: { one: 'Uniti — {count} pagina · {size}', other: 'Uniti — {count} pagine · {size}' },
      errFile: 'Impossibile aggiungere “{name}” — non è un PDF leggibile.',
    },
    img: {
      errNone: 'Nessuna immagine elaborata da combinare in un PDF.',
    },
    img2: {
      hint: 'Genera un’immagine per ogni pagina. Scegli formato e risoluzione.',
      format: 'Formato',
      resolution: 'Risoluzione',
      dpiScreen: 'Schermo',
      dpiStandard: 'Standard',
      dpiPrint: 'Stampa',
      pages: 'Pagine',
      scopeAll: 'Tutte le pagine',
      scopeSelected: 'Selezionate ({count})',
      downloadZip: 'Scarica ZIP',
      sendToEditor: 'Invia all’editor',
      rendering: 'Generazione pagine… {done}/{total}',
      zipping: 'Creazione pacchetto…',
      done: { one: 'Generata {count} pagina.', other: 'Generate {count} pagine.' },
      sent: {
        one: 'Inviata {count} pagina all’editor.',
        other: 'Inviate {count} pagine all’editor.',
      },
      noEditor: 'Impossibile inviare all’editor in questo momento.',
    },
  },

  privacyNote:
    'Le immagini vengono elaborate localmente nel browser — nulla viene caricato online o salvato.',

  svgPaste: {
    toggle: 'Incolla SVG',
    placeholder: 'Incolla qui il markup SVG, es. <svg viewBox="0 0 24 24">...</svg>',
    convert: 'Converti in immagine',
    clear: 'Cancella',
  },

  step2: { title: 'Scegli una dimensione' },

  recipe: {
    label: 'Cosa vuoi fare?',
    compress: 'Comprimi / ottimizza',
    compressTitle: 'Riduci la dimensione del file mantenendo le dimensioni originali',
    emailSafe: 'Rendi adatto all’email',
    emailSafeTitle: 'Ridimensiona e comprimi a una dimensione piccola e compatibile per l’email',
    convert: 'Converti formato',
    convertTitle: 'Cambia il formato del file senza ridimensionare — scegli un formato sotto',
  },

  preset: {
    label: 'Preset',
    groupWeb: 'Web',
    groupSocial: 'Social',
    groupEmail: 'Email',
    fullHd: 'Full HD — 1920 × 1080',
    largeWeb: 'Web grande — 1600 px',
    thumbnail: 'Miniatura — 800 × 800 (adatta)',
    squareSocial: 'Social quadrato — 1080 × 1080 · 1:1',
    portraitSocial: 'Social verticale — 1080 × 1350 · 4:5',
    storySocial: 'Storia / Reel — 1080 × 1920 · 9:16',
    landscapeSocial: 'Social orizzontale — 1200 × 675 · 16:9',
    openGraph: 'Open Graph / Anteprima link — 1200 × 630 · 1.90:1',
    youtubeThumb: 'Miniatura YouTube — 1280 × 720 · 16:9',
    pinterestPin: 'Pin Pinterest — 1000 × 1500 · 2:3',
    profileAvatar: 'Avatar profilo — 800 × 800 (ritaglio) · 1:1',
    emailHero: 'Email hero — larghezza 600 px',
    emailRetina: 'Email retina — larghezza 1200 px',
    custom: 'Personalizzato',
    save: 'Salva preset',
    saveTitle: 'Salva le impostazioni correnti come preset',
    deleteTitle: 'Elimina preset salvato',
    deleteAria: 'Elimina preset',
    exportTitle: 'Esporta i preset come JSON',
    exportAria: 'Esporta preset',
    importTitle: 'Importa preset da JSON',
    importAria: 'Importa preset',
  },

  customize: { summary: 'Personalizza dimensione, formato e qualità' },

  mode: {
    legend: 'Modalità',
    original: 'Mantieni dimensioni originali (nessun ridimensionamento)',
    originalTip:
      'Mantiene le dimensioni in pixel originali — converte solo il formato e riduce il peso del file',
    fit: 'Adatta al riquadro',
    fitTip:
      'Ridimensiona l’immagine per adattarla alla larghezza e all’altezza target, mantenendo le proporzioni',
    longEdge: 'Lato lungo massimo',
    longEdgeTip: 'Ridimensiona il lato più lungo al valore target, mantenendo le proporzioni',
    exact: 'Dimensioni esatte con ritaglio',
    exactTip: 'Ridimensiona e ritaglia al centro alle dimensioni target esatte',
  },

  dimensions: {
    label: 'Larghezza / Altezza (px)',
    w: 'L',
    h: 'A',
    widthAria: 'Larghezza target in pixel',
    heightAria: 'Altezza target in pixel',
  },

  output: {
    heading: 'Output',
    formatLabel: 'Formato',
    qualityLabel: 'Qualità:',
    targetSize: 'Peso file desiderato',
    targetSizeTip:
      'Regola iterativamente la qualità per raggiungere il peso file desiderato (solo JPEG/WebP/AVIF)',
    targetSizeAria: 'Peso file desiderato in KB',
    filenameLabel: 'Schema nome file',
    filenameTokens: 'Token: {name} {width} {height} {preset} {format} {breakpoint}',
    multiSize: 'Esporta in più dimensioni',
    multiSizeTip: 'Genera più varianti di dimensione da ogni immagine, raccolte in un ZIP',
    breakpointLabel: 'Set di breakpoint',
    bpWebStandard: 'Web standard (320, 640, 1024, 1920)',
    bpRetina: 'Web retina (640, 1280, 1920, 2560)',
    bpThumbnails: 'Miniature (100, 200, 400, 800)',
    bpSocial: 'Social media (400, 800, 1080, 1200)',
    bpCustom: 'Personalizzato',
    customSizesPlaceholder: 'es. 320, 640, 1024, 1920',
    customSizesAria: 'Dimensioni breakpoint personalizzate',
  },

  processing: {
    heading: 'Elaborazione',
    stripExif: 'Rimuovi i metadati EXIF',
    stripExifTip: 'Rimuove informazioni sulla fotocamera, GPS e altri metadati dall’output',
    neverUpscale: 'Non ingrandire le immagini',
    neverUpscaleTip: 'Impedisce che l’output superi le dimensioni dell’originale',
    reset: 'Ripristina valori predefiniti',
    resetTip: 'Cancella le impostazioni salvate e ripristina i valori predefiniti',
  },

  step3: {
    title: 'Esporta',
    download: 'Scarica',
    downloadTip: 'Scarica tutte le immagini elaborate',
    zip: 'ZIP',
    zipTip: 'Scarica tutte le immagini come un unico ZIP',
    meta: 'Disponibile dopo il passaggio 1',
  },

  empty: {
    aria: 'Per iniziare',
    dropAria: 'Trascina qui immagini o PDF o fai clic per scegliere i file',
    title: 'Trascina immagini da ridimensionare, o un PDF da ottimizzare',
    sub: 'Non lasciano mai il tuo browser. Oppure premi <kbd class="content-empty-kbd">⌘O</kbd> per scegliere i file.',
    chipsAria: 'Inizia con un preset',
    chipPdf: 'Ottimizza un PDF',
    chipConvert: 'Converti e comprimi',
    chipFullHd: 'Full HD',
    chipSquare: 'Social quadrato',
    chipEmail: 'Email hero',
  },

  preview: {
    aria: 'Immagini elaborate',
    heading: 'Anteprima',
    actionsAria: 'Azioni immagine',
    selectAll: 'Seleziona tutto',
    deselectAll: 'Deseleziona tutto',
    clearAll: 'Rimuovi tutto',
    clearAllTip: 'Rimuovi tutte le immagini dalla coda',
    responsiveZip: 'ZIP responsive',
    responsiveZipTip: 'Esporta tutte le immagini in più dimensioni come ZIP',
    downloadZip: 'Scarica ZIP',
    downloadZipTip: 'Esporta tutte le immagini come un unico archivio ZIP',
    downloadPdf: 'PDF',
    downloadPdfTip: 'Combina tutte le immagini in un unico PDF (un’immagine per pagina)',
    download: 'Scarica',
    downloadTip: 'Scarica singolarmente tutte le immagini elaborate',
    progressAria: 'Avanzamento elaborazione batch',
  },

  bulk: {
    aria: 'Azioni in blocco per le immagini selezionate',
    rotateLeft: 'Ruota a sinistra',
    rotateLeftTip: 'Ruota le immagini selezionate di 90° in senso antiorario',
    rotateLeftAria: 'Ruota la selezione a sinistra',
    rotateRight: 'Ruota a destra',
    rotateRightTip: 'Ruota le immagini selezionate di 90° in senso orario',
    rotateRightAria: 'Ruota la selezione a destra',
    flipH: 'Ribalta O',
    flipHTip: 'Specchia orizzontalmente le immagini selezionate',
    flipHAria: 'Ribalta orizzontalmente la selezione',
    flipV: 'Ribalta V',
    flipVTip: 'Specchia verticalmente le immagini selezionate',
    flipVAria: 'Ribalta verticalmente la selezione',
    download: 'Scarica',
    downloadTip: 'Scarica singolarmente le immagini selezionate',
    downloadAria: 'Scarica le immagini selezionate',
    zip: 'ZIP',
    zipTip: 'Raccogli le immagini selezionate in un unico archivio ZIP',
    zipAria: 'Scarica le immagini selezionate come ZIP',
    combine: 'Combina in PDF',
    combineTip: 'Combina le immagini e i PDF selezionati in un unico PDF (in ordine)',
    combineAria: 'Combina i file selezionati in un unico PDF',
    optimize: 'Ottimizza PDF',
    optimizeTip:
      'Comprimi i PDF selezionati (ricomprime le immagini, rimuove il superfluo; il testo resta selezionabile)',
    optimizeAria: 'Ottimizza i PDF selezionati',
    optimizingN: 'Ottimizzazione {done}/{total}…',
    optimizeStart: 'Ottimizzazione di {count} PDF…',
    optimizeDone: 'Ottimizzati {count} PDF · risparmio {pct}%',
    optimizeFailed: 'Impossibile ottimizzare i PDF selezionati.',
    delete: 'Elimina',
    deleteTip: 'Rimuovi i file selezionati dalla coda (Canc / Backspace)',
    deleteAria: 'Elimina i file selezionati',
    deselect: 'Deseleziona',
    // Etichette di conteggio della selezione. Le voci {one, other} usano `count`;
    // le forme mista/Part sono composte in JS (selectionCountLabel).
    countImages: { one: '{count} immagine selezionata', other: '{count} immagini selezionate' },
    countPdfs: { one: '{count} PDF selezionato', other: '{count} PDF selezionati' },
    countMixed: '{images}, {pdfs} selezionati',
    countImagesPart: { one: '{count} immagine', other: '{count} immagini' },
    countPdfsPart: { one: '{count} PDF', other: '{count} PDF' },
    // Toast del ciclo di vita di Combina in PDF.
    combineBuilding: 'Creazione del PDF da {count} file…',
    combineDone: 'Combinati {count} file in un PDF',
    combineFailed: 'Impossibile creare il PDF: {message}',
  },

  footer: {
    privacy: 'Privacy',
    support: 'Supporto',
    feedback: 'Feedback',
    source: 'Codice sorgente',
    cookies: 'Impostazioni cookie',
    versionTitle: 'Visualizza le novità',
    versionAria: 'Visualizza le novità',
    credit:
      'Creato da <a href="https://321enterprise.com/" target="_blank" rel="noopener noreferrer">321Enterprise</a>. Hai bisogno di uno strumento web su misura? <a href="https://321enterprise.com/index.html#contact" target="_blank" rel="noopener noreferrer">Contattaci</a>.',
  },

  // ---- Stringhe dinamiche (toast, annunci per screen reader) ----
  toast: {
    copied: 'Copiato!',
    storageUnavailable:
      'L’archiviazione non è disponibile in questa modalità del browser — impostazioni, preset e cronologia non verranno conservati tra le visite.',
    presetSaved: 'Preset "{name}" salvato.',
    presetDeleted: 'Preset "{name}" eliminato.',
    noPresetsExport: 'Nessun preset personalizzato da esportare.',
    noValidPresets: 'Nessun preset valido trovato nel file.',
    presetsExported: { one: 'Esportato {count} preset.', other: 'Esportati {count} preset.' },
    presetsImported: { one: 'Importato {count} preset.', other: 'Importati {count} preset.' },
    importFailed: 'Importazione dei preset non riuscita. File JSON non valido.',
    settingsReset: 'Impostazioni ripristinate ai valori predefiniti.',
    settingsRestored: 'Impostazioni ripristinate.',
    pasteSvgFirst: 'Incolla prima il codice SVG.',
    noSvgTag: 'Nessun tag <svg> trovato nel codice incollato.',
    svgConverted: 'SVG convertito e aggiunto alla coda.',
    svgFailed: 'Elaborazione del codice SVG non riuscita.',
    decodingHeic: 'Decodifica di "{name}" — i file HEIC richiedono qualche secondo...',
    failedItem: 'Non riuscito: {name} — {message}',
    processed: 'Elaborate {success} di {total} immagini.',
    reprocessFailed: 'Rielaborazione non riuscita. Prova a svuotare e riaggiungere le immagini.',
    noImageCopy: 'Nessuna immagine elaborata da copiare.',
    copiedToClipboard: 'Copiato "{name}" negli appunti.',
    copyFailed:
      'Copia non riuscita — il browser potrebbe non supportare le immagini negli appunti.',
    removed: { one: 'Rimossa {count} immagine.', other: 'Rimosse {count} immagini.' },
    noToDownload: 'Nessuna immagine {subject} da scaricare.',
    noToExport: 'Nessuna immagine {subject} da esportare.',
    zipFailed: 'Esportazione ZIP non riuscita: {message}',
    noImagesExport: 'Nessuna immagine da esportare.',
    noBreakpoints: 'Nessun breakpoint configurato per l’esportazione responsive.',
    responsiveFailed: 'Esportazione responsive non riuscita: {message}',
    editFailed: 'Modifica non riuscita: {name} — {message}',
    revertedOriginal: 'Ripristinato all’originale.',
    noneSelected: 'Nessuna immagine selezionata.',
    stillProcessing: 'Elaborazione in corso — riprova tra un momento.',
    loadingEdit: 'Caricamento dell’immagine per la modifica...',
    heicEditFailed: 'Impossibile caricare l’immagine HEIC per la modifica.',
    svgEditFailed: 'Impossibile caricare l’immagine SVG per la modifica.',
    undo: 'Annulla',
    subjectSelected: 'selezionate',
    subjectProcessed: 'elaborate',
    megapixelWarn:
      '"{name}" è di {mp}MP — l’operazione potrebbe essere lenta o usare molta memoria.',
    unsupportedType:
      'Tipo di file non supportato: {names}. Formati accettati: JPEG, PNG, WebP, GIF, HEIC, SVG, AVIF.',
    andMore: 'e altri {count}',
    largeBatch:
      '{count} file rilasciati — i lotti oltre {max} potrebbero essere lenti. Elaborazione comunque in corso.',
    animatedGifWarn:
      '"{name}" è animato — imposta il formato di output su GIF per conservare l’animazione.',
    apngWarn:
      '"{name}" è un PNG animato (APNG) — l’animazione andrà persa; verrà esportato solo il primo fotogramma.',
    animatedWebpWarn:
      '"{name}" è un WebP animato — l’animazione andrà persa; verrà esportato solo il primo fotogramma.',
    unexpectedError:
      'Si è verificato un errore imprevisto durante l’elaborazione. Riprova o svuota le immagini.',
    noToDownloadErr:
      'Nessuna immagine {subject} da scaricare — {errored} non elaborate correttamente.',
    savedOfTotal: 'Salvate {saved} di {total} — {errored} non riuscite.',
    exported: { one: 'Esportata {count} immagine.', other: 'Esportate {count} immagini.' },
    exportedFiles: { one: 'Esportato {count} file.', other: 'Esportati {count} file.' },
    zipping: {
      one: 'Compressione di {count} immagine...',
      other: 'Compressione di {count} immagini...',
    },
    zipExported: {
      one: 'ZIP esportato con {count} immagine.',
      other: 'ZIP esportato con {count} immagini.',
    },
    pdfBuilding: {
      one: 'Creazione del PDF da {count} immagine…',
      other: 'Creazione del PDF da {count} immagini…',
    },
    pdfExported: {
      one: 'PDF esportato con {count} pagina.',
      other: 'PDF esportato con {count} pagine.',
    },
    pdfFailed: 'Esportazione PDF non riuscita: {message}',
    generatingVariants: 'Generazione di {variants} varianti in {sizes} dimensioni...',
    responsiveExported: {
      one: 'ZIP responsive esportato: {count} immagine × {sizes} dimensioni.',
      other: 'ZIP responsive esportato: {count} immagini × {sizes} dimensioni.',
    },
    outputSet: 'Output impostato su {w}×{h} (dimensioni esatte)',
  },

  progress: {
    zipping: 'Compressione… {pct}%',
  },

  announce: {
    allSelected: 'Tutte le {count} immagini selezionate.',
    selectionCleared: 'Selezione annullata.',
    imageReordered: 'Immagine riordinata.',
    alreadyTop: 'Già in cima.',
    alreadyBottom: 'Già in fondo.',
    movedToPosition: 'Spostata in posizione {pos} di {total}.',
    imagesAdded: {
      one: '{count} immagine aggiunta. Elaborazione.',
      other: '{count} immagini aggiunte. Elaborazione.',
    },
    processingComplete: {
      one: 'Elaborazione completata. {count} immagine pronta.',
      other: 'Elaborazione completata. {count} immagini pronte.',
    },
    removed: { one: 'Rimossa {count} immagine.', other: 'Rimosse {count} immagini.' },
    restored: { one: 'Ripristinata {count} immagine.', other: 'Ripristinate {count} immagini.' },
    downloaded: 'Scaricato {filename}',
    creatingZip: 'Creazione archivio ZIP.',
    zipDownloaded: 'ZIP scaricato con {count} immagini.',
    creatingPdf: 'Creazione del PDF.',
    pdfDownloaded: 'PDF scaricato con {count} pagine.',
    pdfAdded: 'PDF {name} aggiunto.',
    creatingResponsive: 'Creazione esportazione responsive.',
    responsiveDownloaded: 'ZIP responsive scaricato con {count} varianti.',
    allCleared: 'Tutte le immagini cancellate.',
    revertedOriginal: 'Ripristinato all’originale.',
    transformApplied: {
      one: '{description} applicata a {count} immagine.',
      other: '{description} applicata a {count} immagini.',
    },
    verbRotateRight: 'Ruota a destra',
    verbRotateLeft: 'Ruota a sinistra',
    verbFlipH: 'Ribalta orizzontale',
    verbFlipV: 'Ribalta verticale',
  },

  // ---- Scheda anteprima (costruita in preview.js) ----
  card: {
    editAria: 'Modifica {name}',
    rotateLeftTip: 'Ruota di 90° in senso antiorario',
    rotateLeft: 'Ruota a sinistra',
    rotateRightTip: 'Ruota di 90° in senso orario',
    rotateRight: 'Ruota a destra',
    flipHTip: 'Specchia orizzontalmente',
    flipH: 'Ribalta orizzontale',
    flipVTip: 'Specchia verticalmente',
    flipV: 'Ribalta verticale',
    cropTip: 'Ritaglia selezione',
    crop: 'Ritaglia',
    editTip: 'Apri l’editor immagine completo',
    editTitle: 'Modifica immagine',
    edit: 'Modifica',
    revertTip: 'Annulla le modifiche e ripristina l’originale',
    revertTitle: 'Ripristina l’originale',
    revert: 'Ripristina',
    selectAria: 'Seleziona {name} per le azioni in blocco',
    selectTitle: 'Seleziona per le azioni in blocco',
    thumbTitle: 'Fai clic per aprire l’editor',
    imgAlt: 'Anteprima di {name}',
    framesBadge: '{count} fotogrammi',
    animatedBadge: 'Animato',
    pdfAria: 'PDF: {name}',
    pdfBadge: '{count}p',
    pdfPages: { one: '{count} pagina', other: '{count} pagine' },
    pdfPagesLoading: 'Lettura…',
    pdfThumbAlt: 'Anteprima prima pagina del PDF',
    editPages: 'Modifica pagine',
    editPagesTitle: 'Modifica le pagine del PDF',
    statDimensions: 'Dimensioni',
    statRatio: 'Proporzioni',
    statSize: 'Peso',
    processing: 'Elaborazione…',
    downloadTip: 'Scarica l’immagine elaborata',
    downloadTitle: 'Scarica',
    downloadAria: 'Scarica {name}',
    copyTip: 'Copia negli appunti',
    copyTitle: 'Copia',
    copyAria: 'Copia {name}',
    removeTip: 'Rimuovi dalla coda',
    removeTitle: 'Rimuovi',
    removeAria: 'Rimuovi {name}',
    saved: 'Risparmio',
    larger: 'Più grande',
    errorPrefix: 'Errore: {message}',
    badgeSaved: 'Salvato',
  },

  // ---- Editor ritaglio/immagine (crop-modal.js) ----
  editor: {
    title: 'Modifica immagine',
    toolsAria: 'Strumenti di trasformazione',
    rotateLeftTip: 'Ruota di 90° in senso antiorario (Maiusc+R)',
    rotateLeft: 'Ruota a sinistra',
    rotateRightTip: 'Ruota di 90° in senso orario (R)',
    rotateRight: 'Ruota a destra',
    flipHTip: 'Specchia orizzontalmente (H)',
    flipH: 'Ribalta orizzontale',
    flipVTip: 'Specchia verticalmente (V)',
    flipV: 'Ribalta verticale',
    undoTip: 'Annulla l’ultima modifica (Ctrl+Z)',
    undoTitle: 'Annulla (Ctrl+Z)',
    undoAria: 'Annulla',
    redoTip: 'Ripeti modifica (Ctrl+Y o Ctrl+Maiusc+Z)',
    redoTitle: 'Ripeti (Ctrl+Y)',
    redoAria: 'Ripeti',
    eyedropperTip:
      'Contagocce — campiona il colore di un pixel; la lente d’ingrandimento aiuta la precisione',
    eyedropperTitle: 'Contagocce — preleva colori dall’immagine',
    eyedropperAria: 'Selettore colore contagocce',
    extractTip: 'Estrai i 5 colori dominanti dall’immagine o dal ritaglio corrente',
    extractTitle: 'Estrai i colori dominanti dall’immagine',
    extractAria: 'Estrai la palette di colori',
    resetAll: 'Reimposta tutto',
    cancel: 'Annulla',
    apply: 'Applica',
    aspectRatio: 'Proporzioni',
    free: 'Libero',
    customRatioW: 'Larghezza proporzione personalizzata',
    customRatioH: 'Altezza proporzione personalizzata',
    setRatioTip: 'Applica la proporzione personalizzata al ritaglio',
    set: 'Imposta',
    quickCrop: 'Ritaglio rapido',
    customCropW: 'Larghezza ritaglio personalizzata in pixel',
    customCropH: 'Altezza ritaglio personalizzata in pixel',
    cropExactTip: 'Ritaglia alla dimensione esatta in pixel',
    crop: 'Ritaglia',
    exportSizeLabel: 'Dimensione di esportazione',
    exportW: 'Larghezza di esportazione in pixel',
    exportH: 'Altezza di esportazione in pixel',
    setExportTip: 'Imposta la dimensione di output dell’esportazione',
    clear: 'Cancella',
    colorsTitle: 'Colori',
    closeColorTitle: 'Chiudi il pannello colori',
    closeColorAria: 'Chiudi il pannello colori',
    clickToCopy: 'Fai clic per copiare',
    recentPicks: 'Selezioni recenti',
    copyAll: 'Copia tutto',
    copyAllRecentTitle: 'Copia tutti i valori esadecimali separati da virgola',
    clearRecentTitle: 'Cancella tutti i colori selezionati',
    extractedPalette: 'Palette estratta',
    copyPaletteTitle: 'Copia i valori esadecimali della palette',
    clearPaletteTitle: 'Cancella la palette estratta',
    lockRatioTip: 'Blocca il ritaglio a una proporzione preimpostata',
    ratio: 'Proporzioni',
    grid: 'Griglia',
    gridCyan: 'Griglia ciano',
    gridYellow: 'Griglia gialla',
    gridMagenta: 'Griglia magenta',
    gridRed: 'Griglia rossa',
    gridGreen: 'Griglia verde',
    gridBlue: 'Griglia blu',
    gridWhite: 'Griglia bianca',
    gridBlack: 'Griglia nera',
    fullImage: 'Immagine intera',
    flipPrefix: 'Ribalta',
    cropPrefix: 'Ritaglio',
  },

  // ---- Finestra Guida (help-modal.js). *I blocchi di contenuto sono HTML.* ----
  help: {
    title: 'Guida di PixelGnome',
    dialogAria: 'Guida e novità',
    close: 'Chiudi',
    closeAria: 'Chiudi la guida',
    tabGuide: 'Avvio rapido',
    tabTips: 'Consigli',
    tabChangelog: 'Novità',
    guideContent: `
    <div class="help-section">
      <h3>Per iniziare</h3>
      <p>PixelGnome è un ridimensionatore di immagini che funziona interamente nel tuo browser — niente caricamenti, niente server. Le tue immagini non lasciano mai il tuo dispositivo.</p>
    </div>
    <div class="help-section">
      <h3>Flusso di lavoro di base</h3>
      <ul>
        <li><strong>Trascina o sfoglia</strong> — Trascina le immagini nell’area di rilascio oppure fai clic per sfogliare. Supporta JPEG, PNG, WebP, GIF, HEIC e SVG.</li>
        <li><strong>Scegli le impostazioni</strong> — Seleziona un preset o imposta dimensioni, formato e qualità personalizzati nella barra laterale.</li>
        <li><strong>Modifica per immagine</strong> — Usa i pulsanti di rotazione, ribaltamento e ritaglio sotto ogni anteprima per perfezionare le singole immagini. Fai clic sull’icona di ritaglio per aprire l’editor completo.</li>
        <li><strong>Scarica</strong> — Esporta una singola immagine, tutte le immagini o un archivio ZIP.</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Panoramica delle impostazioni</h3>
      <ul>
        <li><strong>Preset</strong> — Set di dimensioni preconfigurati per i casi d’uso comuni (Full HD, Email hero, ecc.). Salva i tuoi preset personalizzati.</li>
        <li><strong>Modalità di ridimensionamento</strong> — "Adatta al riquadro" mantiene le proporzioni dentro un riquadro. "Lato lungo massimo" scala a una sola dimensione. "Esatta" ritaglia al centro a dimensioni precise.</li>
        <li><strong>Non ingrandire mai</strong> — Se selezionata, l’output non supererà mai le dimensioni dell’immagine di origine. Evita ingrandimenti sfocati.</li>
        <li><strong>Rimuovi EXIF</strong> — Rimuove informazioni sulla fotocamera, coordinate GPS e altri metadati dal file di output.</li>
        <li><strong>Schema nome file</strong> — Personalizza i nomi di output con i token: {name}, {width}, {height}, {preset}, {format}.</li>
      </ul>
    </div>
  `,
    tipsContent: `
    <div class="help-section">
      <h3>Scorciatoie da tastiera</h3>
      <ul>
        <li><strong>Esc</strong> — Chiudi l’editor o qualsiasi finestra</li>
        <li><strong>Tab</strong> — Spostati tra i controlli</li>
        <li><strong>Invio / Spazio</strong> — Attiva il pulsante o l’area di rilascio a fuoco</li>
        <li><strong><kbd>Ctrl/Cmd</kbd> + <kbd>O</kbd></strong> — Apri il selettore di file</li>
        <li><strong><kbd>Canc</kbd> / <kbd>Backspace</kbd></strong> — Rimuovi la scheda a fuoco (o tutte le schede selezionate)</li>
        <li><strong><kbd>Alt</kbd> + <kbd>↑</kbd> / <kbd>↓</kbd></strong> — Sposta la scheda a fuoco su o giù nella coda</li>
      </ul>
    </div>
    <div class="help-section">
      <h3>Consigli utili</h3>
      <ul>
        <li><strong>Rilascia ovunque</strong> — trascina i file in qualsiasi punto della finestra, non solo nell’area di rilascio della barra laterale. Anche <kbd>Ctrl+O</kbd> apre il selettore di file.</li>
        <li><strong>Editor di ritaglio</strong> — trascina le maniglie agli angoli per ridimensionare, trascina all’interno per spostare. Tieni premuto <kbd>Maiusc</kbd> per bloccare le proporzioni, oppure fai clic su <strong>Proporzioni</strong> per bloccarle a un preset (1:1, 16:9, ecc.).</li>
        <li><strong>Annulla / Ripeti</strong> nell’editor — <kbd>Ctrl+Z</kbd> / <kbd>Ctrl+Y</kbd> (o <kbd>Ctrl+Maiusc+Z</kbd>). Fino a 50 passaggi indietro.</li>
        <li><strong>Scorciatoie da tastiera dell’editor</strong> — <kbd>R</kbd> / <kbd>Maiusc+R</kbd> ruotano in senso orario/antiorario, <kbd>H</kbd> / <kbd>V</kbd> ribaltano in orizzontale/verticale.</li>
        <li><strong>Dimensione file target</strong> (sezione Output) — comprimi JPEG/WebP/AVIF a un limite specifico in KB. PixelGnome trova automaticamente la qualità migliore.</li>
        <li><strong>Esportazione multi-dimensione</strong> — genera set di immagini responsive in un solo passaggio. Usa il token <code>{breakpoint}</code> nello schema del nome file per includere la dimensione nel nome di output.</li>
      </ul>
      <p class="help-section-footnote">Passa il mouse su qualsiasi pulsante nella barra degli strumenti o nell’editor per un suggerimento che ne spiega la funzione.</p>
    </div>
    <div class="help-section">
      <h3>Note sulle prestazioni</h3>
      <ul>
        <li>Le immagini oltre {max} megapixel attiveranno un avviso — potrebbero essere lente da elaborare.</li>
        <li>Anche i lotti oltre {batch} file mostreranno un avviso ma verranno elaborati normalmente.</li>
        <li>Le immagini grandi vengono elaborate in un Web Worker quando possibile; alcuni formati (HEIC, SVG, GIF animate) restano sul thread principale e cedono tra i fotogrammi per mantenere reattiva l’interfaccia.</li>
      </ul>
    </div>
  `,
  },

  // ---- Finestra Privacy (privacy-modal.js). *Il blocco di contenuto è HTML.* ----
  privacy: {
    title: 'Privacy e utilizzo',
    close: 'Chiudi',
    closeAria: 'Chiudi privacy',
    content: `
    <div class="help-section">
      <h3>Elaborazione locale</h3>
      <p>PixelGnome ridimensiona, comprime e converte le tue immagini e i tuoi PDF interamente all’interno del tuo browser web. Tutta l’elaborazione avviene sul tuo dispositivo — nessun server svolge il lavoro.</p>
    </div>
    <div class="help-section">
      <h3>Nessun caricamento, nessuna archiviazione</h3>
      <p>Le tue immagini e i tuoi PDF non vengono mai caricati o inviati da nessuna parte e non vengono mai memorizzati da noi. Quando chiudi o aggiorni la pagina, vengono cancellati dalla memoria.</p>
      <p>Le uniche cose salvate sono le tue preferenze — impostazioni, tema, eventuali preset che crei e la tua scelta sull’analisi — conservate nell’archiviazione locale del tuo browser, sul tuo dispositivo. Puoi cancellarle in qualsiasi momento con "Ripristina valori predefiniti" o cancellando i dati del browser.</p>
    </div>
    <div class="help-section">
      <h3>Nessun account</h3>
      <p>PixelGnome non richiede registrazione, accesso o informazioni personali per essere usato.</p>
    </div>
    <div class="help-section">
      <h3>Analisi</h3>
      <p>Questo sito usa Google Analytics (tramite Google Tag Manager) per comprendere il traffico aggregato e anonimo — ad esempio quante persone visitano il sito e quali funzioni vengono usate. Misura le visite alle pagine e alcune azioni nell’app, come quando i file vengono elaborati o esportati. Conta solo quelle azioni; non vede, riceve o trasmette mai i file stessi — le tue immagini e i tuoi PDF restano sempre sul tuo dispositivo.</p>
      <p>Google Analytics imposta cookie ed elabora questi dati sui server di Google. Gli indirizzi IP vengono troncati, i dati non vengono usati per identificarti e non li usiamo per la pubblicità. L’analisi viene eseguita solo dopo che hai dato il consenso tramite il banner dei cookie — fino ad allora non viene inviato nulla. Puoi modificare la tua scelta in qualsiasi momento usando <strong>Impostazioni cookie</strong> nel piè di pagina.</p>
      <p>La versione portatile a file singolo di PixelGnome non contiene alcuna analisi e non effettua richieste di rete.</p>
    </div>
    <div class="help-section">
      <h3>Collegamenti esterni</h3>
      <p>PixelGnome rimanda ad alcuni servizi esterni — Ko-fi (per il supporto facoltativo) e 321Enterprise (lo studio dietro lo strumento). Quei siti hanno le proprie pratiche sulla privacy, che non controlliamo.</p>
    </div>
    <div class="help-section">
      <h3>Usa a tuo rischio</h3>
      <p>PixelGnome è fornito gratuitamente e "così com’è", senza alcuna garanzia. Conserva sempre copie di backup dei file originali importanti prima dell’elaborazione. Non siamo responsabili per eventuali perdite o danni ai tuoi file.</p>
    </div>
    <div class="help-section">
      <p style="color: var(--color-text-muted);">Ultimo aggiornamento: maggio 2026.</p>
    </div>
  `,
  },

  // ---- Banner consenso cookie (consent-banner.js) ----
  consent: {
    aria: 'Consenso ai cookie di analisi',
    text: 'PixelGnome usa Google Analytics per misurare il traffico anonimo e aggregato — solo le visite alle pagine. Nulla viene caricato o inviato finché non accetti. Le tue immagini e i tuoi PDF vengono sempre elaborati localmente e non vengono mai caricati.',
    learn: 'Scopri di più',
    decline: 'Rifiuta',
    accept: 'Accetta',
  },

  // ---- Cassetto cronologia (history.js) ----
  history: {
    heading: 'Cronologia',
    clearTitle: 'Cancella cronologia',
    clearAria: 'Cancella cronologia',
    timeJustNow: 'proprio ora',
    timeSeconds: '{n} s fa',
    timeMinutes: '{n} min fa',
    timeHours: '{n} h fa',
    timeDays: '{n} g fa',
  },
};
