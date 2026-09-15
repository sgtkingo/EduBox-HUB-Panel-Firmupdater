import { useState, useEffect, useRef } from "react";
import {
  Terminal,
  RefreshCw,
  Zap,
  AlertCircle,
  Download,
  Play,
  AlertTriangle,
  HelpCircle,
  X,
  ExternalLink,
  FileText,
  Check,
  Cable,
  ChevronDown,
  ChevronUp,
  Star,
} from "lucide-react";

// esptool-js via npm (NO CDN)
import { ESPLoader, Transport } from "esptool-js";

// --- TypeScript Definitions for Web Serial API ---
interface SerialPort {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream;
  writable: WritableStream;
}

interface GithubAsset {
  id: number;
  url: string; 
  name: string;
  browser_download_url: string;
  size: number;
}

interface GithubRelease {
  tag_name: string;
  name: string;
  published_at: string;
  html_url: string;
  assets: GithubAsset[];
  body: string;
}

export default function App() {
  const [port, setPort] = useState<SerialPort | null>(null);
  const [status, setStatus] = useState<string>("Inicializace...");
  const [progress, setProgress] = useState<number>(0);
  const [logs, setLogs] = useState<string>("");
  const [latestRelease, setLatestRelease] = useState<GithubRelease | null>(null);
  const [appVersion, setAppVersion] = useState<string>("...");
  
  const [portSelected, setPortSelected] = useState<boolean>(false);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [firmwareBin, setFirmwareBin] = useState<ArrayBuffer | null>(null);
  const [useProxy, setUseProxy] = useState<boolean>(false);

  // State pro nápovědu
  const [showHelp, setShowHelp] = useState<boolean>(false);
  const [activeHelpSection, setActiveHelpSection] = useState<string | null>(null);

  const [loadingUpdate, setLoadingUpdate] = useState<boolean>(true);

  const terminalEndRef = useRef<HTMLDivElement>(null);
  const readerRef = useRef<ReadableStreamDefaultReader | null>(null);
  const portRef = useRef<SerialPort | null>(null);
  const keepReadingRef = useRef<boolean>(false);
  
  // Ref pro zabránění dvojímu spuštění v React Strict Mode
  const initialized = useRef(false);

  const REPO_OWNER = "sgtkingo";
  const REPO_NAME = "EduBox-HUB-Panel";
  const BAUD_RATE = 115200;

  // --- 1. Automatická kontrola updatů po startu ---
  useEffect(() => {
    // Zámek proti dvojímu spuštění (React Strict Mode fix)
    if (!initialized.current) {
      initialized.current = true;
      checkUpdates();
      loadAppVersion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addLog = (msg: string) => {
    setLogs((prev) => prev + `[${new Date().toLocaleTimeString()}] ${msg}\n`);
    // eslint-disable-next-line no-console
    console.log(`[AppLog] ${msg}`);
  };

  const loadAppVersion = async () => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}VERSION`);
      if (response.ok) {
        const version = await response.text();
        setAppVersion(version.trim());
      }
    } catch (error) {
      console.error("Failed to load app version:", error);
      setAppVersion("dev");
    }
  };
 
  const openHelp = (section: string) => {
    setActiveHelpSection(section);
    setShowHelp(true);
  };

  const toggleHelpSection = (section: string) => {
    setActiveHelpSection((prev) => (prev === section ? null : section));
  };

  const checkUpdates = async () => {
    setLoadingUpdate(true);
    setStatus("Kontrola aktualizací...");
    addLog(`Automatická kontrola GitHub verze: ${REPO_OWNER}/${REPO_NAME}...`);
    setLatestRelease(null);
    setFirmwareBin(null);

    try {
      const response = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/releases/latest`
      );
      if (!response.ok) throw new Error(`GitHub API Error: ${response.statusText}`);

      const data: GithubRelease = await response.json();
      setLatestRelease(data);
      addLog(`Nalezena verze: ${data.tag_name}`);

      const binAsset = data.assets.find((asset) => asset.name.endsWith(".ino.merged.bin"));
      if (binAsset) {
        addLog(
          `Nalezen firmware: ${binAsset.name} (${(binAsset.size / 1024).toFixed(2)} KB)`
        );
        addLog(`Firmware URL: ${binAsset.browser_download_url}`);
        await downloadFirmware(binAsset);
      } else {
        addLog("Varování: Release neobsahuje .bin soubor.");
        setStatus("Binárka nenalezena");
        openHelp("firmware");
      }
    } catch (error: any) {
      addLog(`Chyba kontroly aktualizací: ${error.message}`);
      setStatus("Chyba sítě");
      openHelp("firmware");
    } finally {
      setLoadingUpdate(false);
    }
  };

  const downloadFirmware = async (asset: GithubAsset) => {
    setStatus("Stahuji firmware...");
    //addLog("Stahuji .bin soubor...");
    //addLog(`>>> Download asset: ${asset.name}, ${asset.id}, ${asset.url}, ${asset.browser_download_url}`);
    //Temporary fix pro CORS problémy s GitHubem - místo API URL použijeme přímo raw URL, které by mělo fungovat bez CORS proxy
    const FIRMWARE_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/main/bin/latest/${asset.name}`;
    addLog(`Stahuji firmware z: ${FIRMWARE_RAW_URL} (přes ${useProxy ? "CORS Proxy" : "přímo"})`);
      
    try {
      const response = await fetch(FIRMWARE_RAW_URL, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      addLog(`${response.status} ${response.statusText} - Stahování dokončeno, načítám data...`);

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength === 0) throw new Error("Prázdný soubor.");

      setFirmwareBin(arrayBuffer);
      addLog(`Firmware připraven (${arrayBuffer.byteLength} bytes).`);
      setStatus("Připraveno k flashování");
    } catch (error: any) {
      addLog(`Chyba stahování: ${error.message}`);
      setStatus("Chyba stahování");
      openHelp("firmware");
    }
  };

  const connectToDevice = async () => {
    const nav = navigator as any;
    if (!nav.serial) {
      addLog("Chyba: Web Serial API není podporováno.");
      return;
    }
    try {
      const selectedPort = await nav.serial.requestPort();
      await selectedPort.open({ baudRate: BAUD_RATE });

      setPort(selectedPort);
      portRef.current = selectedPort;
      setPortSelected(true);

      addLog("Port otevřen. Monitor aktivní.");
      setStatus("Zařízení Připojeno");

      keepReadingRef.current = true;
      readSerialLoop(selectedPort);
    } catch (error: any) {
      addLog(`Chyba připojení: ${error.message}`);
      if (error.name === "NotFoundError") {
        setPortSelected(false);
        openHelp("device");
      }
    }
  };

  const readSerialLoop = async (currentPort: SerialPort) => {
    while (currentPort.readable && keepReadingRef.current) {
      try {
        const reader = currentPort.readable.getReader();
        readerRef.current = reader as any;
        while (true) {
          const { done } = await reader.read();
          if (done) break;
          if (!keepReadingRef.current) break;
        }
      } catch (error) {
        // Ignore errors
      } finally {
        if (readerRef.current) {
          try {
            readerRef.current.releaseLock();
          } catch (e) {}
          readerRef.current = null;
        }
      }
    }
  };

  const flashFirmware = async () => {
    if (!firmwareBin) return;

    setIsFlashing(true);
    setStatus("Příprava...");
    setProgress(0);
    addLog("--- START FLASHOVÁNÍ ---");

    // 0) Must have an already selected port from step #2
    const device = portRef.current;
    if (!device) {
      addLog("CHYBA: Není vybraný žádný port (nejdřív krok 2 – Připojení).");
      setStatus("Chyba nahrávání");
      setPortSelected(false);
      setIsFlashing(false);
      openHelp("device");
      return;
    }

    // 1) Stop serial monitor and release reader
    keepReadingRef.current = false;
    if (readerRef.current) {
      try {
        await readerRef.current.cancel();
      } catch {}
    }
    await new Promise((r) => setTimeout(r, 100));

    // 2) Close the port to release it from monitor usage (best-effort)
    try {
      await device.close();
    } catch {}

    setPort(null);

    try {
      // 3) Create transport + loader on the SAME selected port
      const transport = new Transport(device, true);
      const loader = new ESPLoader({
        transport,
        baudrate: BAUD_RATE,
        romBaudrate: BAUD_RATE, 
        terminal: {
          clean: () => {},
          writeLine: (data: string) => addLog("[ESP]: " + String(data)),
          write: (_data: string) => {},
        },
      });


      // 4) Connect to ROM bootloader and run stub
      addLog("Připojuji k bootloaderu...");
      await loader.main();
      addLog("Bootloader připojen.");

      // 5) Prepare firmware payload
      addLog("Zapisuji firmware...");

      const fwU8 = new Uint8Array(firmwareBin);

      // Fix for: bStr.charCodeAt is not a function
      const fwBstr =
        typeof (loader as any).ui8ToBstr === "function"
          ? (loader as any).ui8ToBstr(fwU8)
          : null;

      const fileArray = fwBstr
        ? [{ data: fwBstr, address: 0x0 }]
        : [{ data: fwU8, address: 0x0 }];

      await (loader as any).writeFlash({
        fileArray,
        flashSize: "keep",
        flashMode: "keep",
        flashFreq: "keep",
        eraseAll: false,
        compress: true,
        reportProgress: (_fileIndex: number, written: number, total: number) => {
          const percent = total > 0 ? Math.round((written / total) * 100) : 0;
          setProgress(percent);
          setStatus(`Nahrávám: ${percent}%`);
        },
      });

      addLog("HOTOVO! Resetujte zařízení.");
      setStatus("ÚSPĚCH");
    } catch (error: any) {
      console.error(error);
      addLog(`CHYBA: ${error?.message ?? String(error)}`);
      setStatus("Chyba nahrávání");
      openHelp("flash");
    } finally {
      setIsFlashing(false);

      // 6) Re-open the SAME port for monitoring again (best-effort)
      try {
        await device.open({ baudRate: BAUD_RATE });
        setPort(device);
        portRef.current = device;

        keepReadingRef.current = true;
        readSerialLoop(device);

        addLog("Port znovu otevřen. Monitor aktivní.");
        if (status !== "ÚSPĚCH") setStatus("Zařízení Připojeno");
      } catch {
        // If reopen fails, user can reconnect manually
        keepReadingRef.current = false;
      }
    }
  };


  // Helper pro zobrazení statusu
  const getStatusMessage = () => {
    if (isFlashing) return `Flashuju... (${progress}%)`;
    if (status === "ÚSPĚCH") return "Dokončeno!";
    if (status.includes("Chyba") || status.includes("Error")) return status;
    if (status.includes("Stahuji") || status.includes("Kontrola")) return status;
    if (!port) return "Nebylo detekováno žádné zařízení";
    return "Připraven";
  };

  // Helper pro barvu statusu
  const getStatusColor = () => {
    const msg = getStatusMessage();
    if (msg.includes("Chyba") || msg.includes("Error")) return "text-red-700";
    if (msg === "Dokončeno!" || msg === "Připraven") return "text-emerald-700";
    if (msg.includes("Flashuju")) return "text-mta-blue";
    if (msg === "Nebylo detekováno žádné zařízení") return "text-amber-800";
    return "text-mta-dark";
  };

  const flashDisabledReason =
  !firmwareBin
    ? "Nejprve stáhni firmware (krok 1)."
    : !portSelected
    ? "Nejprve připoj zařízení v kroku č. 2."
    : isFlashing
    ? "Probíhá nahrávání."
    : "";

  const flashDisabled = !firmwareBin || !portSelected || isFlashing;

  return (
    <div className="mta-app min-h-screen text-mta-ink relative">
      {/* Help Modal */}
      {showHelp && (
        <div className="fixed inset-0 bg-mta-dark/75 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border border-slate-200 flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-mta-mist rounded-t-xl">
              <h3 className="text-xl font-bold text-mta-dark flex items-center gap-2">
                <HelpCircle className="text-mta-blue" /> Nápověda a řešení problémů
              </h3>
              <button
                onClick={() => setShowHelp(false)}
                className="text-slate-600 hover:text-mta-blue"
                aria-label="Zavřít nápovědu"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-0 overflow-y-auto">
              {/* Accordion: Firmware Issue */}
              <div className="border-b border-slate-200">
                <button
                  onClick={() => toggleHelpSection("firmware")}
                  className={`w-full flex justify-between items-center p-4 text-left font-semibold ${
                    activeHelpSection === "firmware"
                      ? "bg-mta-mist text-mta-dark"
                      : "hover:bg-mta-mist/70 text-mta-ink"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <RefreshCw size={18} /> Nestáhl se poslední firmware
                  </span>
                  {activeHelpSection === "firmware" ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>
                {activeHelpSection === "firmware" && (
                  <div className="p-4 bg-slate-50 text-sm text-slate-700 space-y-2">
                    <p>Pokud aplikace nemůže načíst verzi z GitHubu:</p>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>Zkontrolujte připojení k internetu.</li>
                      <li>
                        Zkuste zaškrtnout/odškrtnout možnost <strong>"Použít CORS Proxy"</strong>
                        v sekci 1.
                      </li>
                      <li>
                        GitHub API může mít dočasný výpadek nebo limit požadavků. Zkuste to za chvíli
                        znovu.
                      </li>
                    </ul>
                  </div>
                )}
              </div>

              {/* Accordion: Device Visibility (Drivers) */}
              <div className="border-b border-slate-200">
                <button
                  onClick={() => toggleHelpSection("device")}
                  className={`w-full flex justify-between items-center p-4 text-left font-semibold ${
                    activeHelpSection === "device"
                      ? "bg-mta-mist text-mta-dark"
                      : "hover:bg-mta-mist/70 text-mta-ink"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Cable size={18} /> Nevidím zařízení / COM Port
                  </span>
                  {activeHelpSection === "device" ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>
                {activeHelpSection === "device" && (
                  <div className="p-4 bg-slate-50 text-sm text-slate-700 space-y-4">
                    <p>Pokud seznam portů zeje prázdnotou, chybí vám ovladače pro USB převodník.</p>

                    <div className="space-y-3">
                      <a
                        href="https://www.silabs.com/software-and-tools/usb-to-uart-bridge-vcp-drivers?tab=overview"
                        target="_blank"
                        rel="noreferrer"
                        className="relative block border-2 border-mta-blue/40 bg-mta-mist rounded p-3 hover:bg-blue-100 transition-colors group text-left"
                      >
                        <div className="absolute -top-2.5 left-2 bg-mta-blue text-white text-xs font-bold px-2 py-0.5 rounded-full shadow flex items-center gap-1">
                          <Star size={10} fill="white" /> DOPORUČENO
                        </div>
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-mta-dark group-hover:text-mta-blue transition-colors">
                              CP210x Ovladače (Silicon Labs)
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                              Používá většina originálních ESP32 DevKit desek. Toto je nejpravděpodobnější
                              řešení.
                            </p>
                          </div>
                          <ExternalLink
                            size={18}
                            className="text-mta-blue transition-colors"
                          />
                        </div>
                      </a>

                      <a
                        href="https://www.wch-ic.com/downloads/CH341SER_EXE.html"
                        target="_blank"
                        rel="noreferrer"
                        className="block border border-slate-300 bg-white rounded p-3 hover:bg-mta-mist transition-colors group text-left"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-bold text-mta-dark group-hover:text-mta-blue transition-colors">
                              CH340 Ovladače (WCH)
                            </div>
                            <p className="text-sm text-slate-600 mt-1">
                              Používá se u levnějších klonů (Lolin, NodeMCU apod.). Pokud první nezabral,
                              zkuste tento.
                            </p>
                          </div>
                          <ExternalLink
                            size={18}
                            className="text-mta-blue transition-colors"
                          />
                        </div>
                      </a>

                      <div className="text-sm text-amber-800 pt-2 border-t border-slate-200">
                        <strong>Tip:</strong> Zkuste také jiný USB kabel. Některé kabely jsou pouze nabíjecí
                        a nepřenáší data!
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Accordion: Flashing Failed */}
              <div className="border-b border-slate-200">
                <button
                  onClick={() => toggleHelpSection("flash")}
                  className={`w-full flex justify-between items-center p-4 text-left font-semibold ${
                    activeHelpSection === "flash"
                      ? "bg-mta-mist text-mta-dark"
                      : "hover:bg-mta-mist/70 text-mta-ink"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Download size={18} /> Selhalo nahrávání (Connecting...)
                  </span>
                  {activeHelpSection === "flash" ? (
                    <ChevronUp size={18} />
                  ) : (
                    <ChevronDown size={18} />
                  )}
                </button>
                {activeHelpSection === "flash" && (
                  <div className="p-4 bg-slate-50 text-sm text-slate-700 space-y-2">
                    <p>
                      Pokud se proces zasekne na hlášce <code>Connecting...</code>, znamená to, že se čip
                      nepřepnul do "Download Mode".
                    </p>
                    <div className="bg-amber-50 border border-amber-200 p-3 rounded text-amber-900">
                      <strong>Manuální postup:</strong>
                      <ol className="list-decimal pl-5 mt-1 space-y-1">
                        <li>Odpojte USB.</li>
                        <li>
                          Držte tlačítko <strong>BOOT</strong> na ESP32.
                        </li>
                        <li>Zapojte USB (tlačítko stále držte).</li>
                        <li>Klikněte na "Aktualizovat Firmware" v aplikaci.</li>
                        <li>Pusťte tlačítko až začne proces nahrávání.</li>
                      </ol>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-mta-mist rounded-b-xl text-center">
              <button
                onClick={() => setShowHelp(false)}
                className="bg-mta-blue hover:bg-mta-dark text-white py-2 px-6 rounded font-semibold transition-colors"
              >
                Rozumím
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="mta-header-band text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}firmupdater-logo.svg`}
              alt="EduBox HUB Panel Firmupdater"
              className="mta-product-logo"
            />
            <div className="min-w-0">
              <h1 className="sr-only">EduBox HUB Panel Firmupdater</h1>
              <p className="text-sm text-blue-100">Aktualizace firmwaru dotykového panelu</p>
            </div>
          </div>
          <button
            onClick={() => setShowHelp(true)}
            className="text-white hover:bg-white/15 flex items-center gap-2 text-sm font-semibold border border-white/60 px-4 py-2 rounded-lg transition-colors"
          >
            <HelpCircle size={18} /> Nápověda
          </button>
        </div>
      </header>

      {/* Primary updater workflow stays visible before secondary content. */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.9fr)] gap-6">
          <div className="space-y-6">
            {/* Step 1: Version Info (Auto-checked) */}
            <section className="mta-step-card p-5 rounded-xl">
              <div className="flex justify-between items-start mb-2">
                <h2 className="text-lg font-bold text-mta-dark flex items-center gap-2">
                  <RefreshCw size={20} className={loadingUpdate ? "animate-spin" : ""} /> 1. Verze
                  Firmwaru
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={checkUpdates}
                    disabled={loadingUpdate}
                    className="text-sm text-mta-blue hover:text-mta-dark flex items-center gap-1 bg-mta-mist px-3 py-1.5 rounded border border-blue-200 hover:bg-blue-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Znovu kontrolovat aktualizace"
                  >
                    <RefreshCw size={12} className={loadingUpdate ? "animate-spin" : ""} /> Obnovit
                  </button>
                  {latestRelease && (
                    <a
                      href={latestRelease.html_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-mta-blue hover:text-mta-dark flex items-center gap-1 bg-mta-mist px-3 py-1.5 rounded border border-blue-200"
                      title="Otevřít release notes na GitHubu"
                    >
                      <FileText size={12} /> Poznámky
                      <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>

              {loadingUpdate ? (
                <div className="text-slate-600 text-sm py-4 text-center">
                  Kontroluji dostupnost nové verze...
                </div>
              ) : latestRelease ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center bg-mta-mist p-3 rounded border border-blue-100">
                    <div>
                      <div className="text-sm text-slate-600">Nejnovější verze:</div>
                      <div className="text-xl font-bold text-mta-dark">{latestRelease.tag_name}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-slate-600">
                        {new Date(latestRelease.published_at).toLocaleDateString()}
                      </div>
                      {firmwareBin ? (
                        <div className="text-sm text-emerald-700 flex items-center gap-1 mt-1 justify-end">
                          <Check size={12} /> Staženo
                        </div>
                      ) : (
                        <div className="text-sm text-red-700">Chyba stažení</div>
                      )}
                    </div>
                  </div>

                  <label className="text-sm text-slate-600 flex items-center gap-1 mt-2">
                    <input
                      type="checkbox"
                      disabled
                      checked={useProxy}
                      onChange={(e) => setUseProxy(e.target.checked)}
                      className="rounded border-slate-300"
                    />
                    Použít CORS Proxy (aktuálně nepodporováno)
                  </label>
                </div>
              ) : (
                <div className="text-red-700 text-sm py-2">Nepodařilo se načíst informace o verzi.</div>
              )}
            </section>

            {/* Step 2: Connection */}
            <section className="mta-step-card p-5 rounded-xl">
              <h2 className="text-lg font-bold text-mta-dark mb-2 flex items-center gap-2">
                <Zap size={20} /> 2. Připojení
              </h2>
              <div className="text-sm text-slate-700 mb-4 space-y-2">
                <p>Připojte EduBox HUB Panel k počítači USB kabelem.</p>
                <p className="text-slate-600 text-sm flex items-center gap-1">
                  <Cable size={12} /> Ujistěte se, že kabel přenáší data (nejen nabíjení).
                </p>
              </div>

              <button
                onClick={connectToDevice}
                disabled={!!portSelected || isFlashing}
                className={`w-full py-3 px-4 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${
                  portSelected
                    ? "bg-emerald-700 text-white cursor-default"
                    : "bg-mta-blue hover:bg-mta-dark text-white"
                }`}
              >
                {portSelected ? "Zařízení připojeno" : "Vybrat zařízení (COM port)"}
              </button>

              {!port && (
                <div className="mt-4 pt-3 border-t border-slate-200 text-sm text-slate-600 flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0 text-mta-blue" />
                  <div>
                    Nevidíte žádný port? <br />
                    <button
                      onClick={() => openHelp("device")}
                      className="text-mta-blue hover:text-mta-dark underline"
                    >
                      Zkontrolujte ovladače (Nápověda)
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Step 3: Flash */}
            <section className="mta-step-card mta-step-card--action p-5 rounded-xl relative overflow-hidden flex flex-col">
              {isFlashing && (
                <div
                  className="absolute top-0 left-0 h-1 bg-mta-orange transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              )}
              <h2 className="text-lg font-bold text-mta-dark mb-4 flex items-center gap-2">
                <Download size={20} /> 3. Nahrát Firmware
              </h2>

              <div className="bg-amber-50 border border-amber-200 rounded p-3 mb-4 text-sm text-amber-900 flex gap-2 items-start">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Tip:</strong> Pokud se nahrávání zasekne na "Connecting...", držte tlačítko
                  <strong> BOOT</strong> na EduBox HUB Panelu (ESP32) v momentě kliknutí na tlačítko níže.
                </div>
              </div>

              <div className="flex justify-between items-center mb-4 text-sm">
                <span className="text-slate-600">Stav:</span>
                <span className={`font-mono ${getStatusColor()}`}>{getStatusMessage()}</span>
              </div>

              <span title={flashDisabled ? flashDisabledReason : ""} className="block">
                <button
                  onClick={flashFirmware}
                  disabled={flashDisabled}
                  className="w-full bg-mta-orange hover:bg-mta-orangeDark disabled:bg-slate-200 disabled:text-slate-500 text-white py-3 px-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2 mt-auto"
                >
                  {isFlashing ? "Nahrávám..." : "Nahrát firmware"} <Play size={18} fill="currentColor" />
                </button>
              </span>
            </section>
          </div>

          {/* Right Column: Terminal */}
          <div className="mta-terminal flex flex-col rounded-xl overflow-hidden h-[560px] lg:sticky lg:top-6">
            <div className="bg-mta-dark px-4 py-3 border-b border-blue-800 flex justify-between items-center">
              <span className="text-sm font-semibold text-white flex items-center gap-2">
                <Terminal size={16} /> Systémový log
              </span>
              <button
                onClick={() => setLogs("")}
                className="text-sm text-blue-100 hover:text-white transition-colors"
              >
                Vymazat
              </button>
            </div>
            <div className="flex-1 p-4 overflow-y-auto font-mono text-sm space-y-1">
              <pre className="text-blue-100 whitespace-pre-wrap break-all">
                {logs || "Čekám na akci uživatele..."}
              </pre>
              <div ref={terminalEndRef} />
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-wrap items-center justify-between gap-5">
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-mta-dark">EduBox HUB Panel · Firmupdater</p>
            <p>Verze {appVersion} · © {new Date().getFullYear()}</p>
            <a href="https://github.com/sgtkingo/EduBox-HUB-Panel-Firmupdater" target="_blank" rel="noopener noreferrer" className="text-mta-blue hover:text-mta-dark underline">Zdrojový kód na GitHubu</a>
          </div>
          <a href="https://m-ta.cz/" target="_blank" rel="noopener noreferrer" aria-label="Moravskoslezská Technologická Akademie – otevřít web">
            <img src={`${import.meta.env.BASE_URL}mta-logo.svg`} alt="Moravskoslezská Technologická Akademie" className="mta-footer-logo" />
          </a>
        </div>
      </footer>
    </div>
  );
}
