import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Html5Qrcode } from "html5-qrcode";
import Barcode from "react-barcode";
import { QRCodeSVG } from "qrcode.react";

interface Item {
  id: string;
  category: string;
  is_rented: boolean;
  current_user: string | null;
  user_class: string | null;
  due_date?: string | null;
}

interface Loan {
  id: number;
  item_id: string;
  user_id: string;
  user_class: string | null;
  loan_date: string;
  due_date?: string | null;
}

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [search, setSearch] = useState("");

  const [scanInput, setScanInput] = useState("");
  const [popupItem, setPopupItem] = useState<Item | null>(null);
  const [isNewItemPopup, setIsNewItemPopup] = useState(false);
  const [newIdToRegister, setNewIdToRegister] = useState("");
  const [newCategory, setNewCategory] = useState("PC");

  const [isGenericLoanPopup, setIsGenericLoanPopup] = useState(false);
  const [genericCategory, setGenericCategory] = useState("Headset");
  const [genericUser, setGenericUser] = useState("");
  const [genericClass, setGenericClass] = useState("");
  const [genericDays, setGenericDays] = useState("");
  const [genericHours, setGenericHours] = useState("");

  // Utskrifts-state
  const [isPrintPopupOpen, setIsPrintPopupOpen] = useState(false);
  const [printType, setPrintType] = useState<"qr" | "barcode">("qr");
  const [labelSizeCm, setLabelSizeCm] = useState<number>(3.0); 
  const [generatedBatch, setGeneratedBatch] = useState<string[]>([]);

  const [loanUser, setLoanUser] = useState("");
  const [loanClass, setLoanClass] = useState("");
  const [loanDays, setLoanDays] = useState("");
  const [loanHours, setLoanHours] = useState("");

  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const popupInputRef = useRef<HTMLInputElement>(null);
  const popupSelectRef = useRef<HTMLSelectElement>(null);

  const loadData = async () => {
    try {
      const fetchedItems = await invoke<Item[]>("get_items");
      setItems(fetchedItems);
      const fetchedLoans = await invoke<Loan[]>("get_loans");
      setLoans(fetchedLoans);
    } catch (err) {
      console.error("Feil ved lasting:", err);
    }
  };

  useEffect(() => {
    loadData();
    scanInputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (popupItem) {
      setTimeout(() => {
        popupInputRef.current?.focus();
      }, 50);
    } else if (isNewItemPopup) {
      setTimeout(() => {
        popupSelectRef.current?.focus();
      }, 50);
    }
  }, [popupItem, isNewItemPopup]);

  const processScannedId = (scannedText: string) => {
    const trimmedId = scannedText.trim();
    if (!trimmedId) return;

    const existing = items.find((i) => i.id === trimmedId);

    if (existing) {
      setPopupItem(existing);
      setIsNewItemPopup(false);
    } else {
      setNewIdToRegister(trimmedId);
      setIsNewItemPopup(true);
      setPopupItem(null);
    }
  };

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null;

    if (cameraActive) {
      setCameraError(null);
      html5QrCode = new Html5Qrcode("reader");

      html5QrCode
        .start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 250, height: 100 } },
          (decodedText) => {
            if (html5QrCode && html5QrCode.isScanning) {
              html5QrCode
                .stop()
                .then(() => {
                  setCameraActive(false);
                  processScannedId(decodedText);
                })
                .catch(console.error);
            }
          },
          () => {}
        )
        .catch((err) => {
          console.error("Kamerafeil:", err);
          setCameraError("Ingen kameraenhet funnet eller tilgang avvist.");
          setCameraActive(false);
        });
    }

    return () => {
      if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().catch((error) => console.error("Feilet med å stoppe kamera:", error));
      }
    };
  }, [cameraActive]);

  const handleScanSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    processScannedId(scanInput);
    setScanInput("");
  };

  const handleRegisterNew = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await invoke("add_item", {
        id: newIdToRegister,
        category: newCategory,
      });
      setIsNewItemPopup(false);
      loadData();
    } catch (err) {
      alert("Feil ved registrering: " + err);
    }
  };

  // Beregning for LIGGENDE (Landscape) A4-ark: 29.7 cm bredde, 21.0 cm høyde
  const calculateTotalFit = (sizeCm: number, type: "qr" | "barcode") => {
    const widthCm = type === "barcode" ? sizeCm * 1.5 : sizeCm;
    const heightCm = sizeCm;
    const cols = Math.floor(28.5 / widthCm);
    const rows = Math.floor(20.0 / heightCm);
    return Math.max(1, cols * rows);
  };

  const generateUniqueBatch = (sizeCm: number, type: "qr" | "barcode") => {
    const totalCount = calculateTotalFit(sizeCm, type);
    const uniqueSet = new Set<string>();

    while (uniqueSet.size < totalCount) {
      const randomNum = Math.floor(100000 + Math.random() * 900000);
      uniqueSet.add(randomNum.toString());
    }

    setGeneratedBatch(Array.from(uniqueSet));
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    try {
      await invoke("delete_item", { itemId: itemToDelete.id });
      setItemToDelete(null);
      loadData();
    } catch (err) {
      alert("Feil ved sletting: " + err);
    }
  };

  const handlePopupCheckout = async () => {
    if (!popupItem) return;
    const user = loanUser.trim() || "Anonym / Elev";
    const userClass = loanClass.trim();

    let dueDateStr: string | null = null;
    const days = parseInt(loanDays) || 0;
    const hours = parseInt(loanHours) || 0;

    if (days > 0 || hours > 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      dueDate.setHours(dueDate.getHours() + hours);
      dueDateStr = dueDate.toISOString();
    }

    try {
      await invoke("checkout_item", {
        itemId: popupItem.id,
        userId: user,
        userClass: userClass,
        dueDate: dueDateStr,
      });
      setPopupItem(null);
      setLoanUser("");
      setLoanClass("");
      setLoanDays("");
      setLoanHours("");
      loadData();
    } catch (err) {
      alert("Feil ved utlån: " + err);
    }
  };

  const handleGenericCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = genericUser.trim() || "Anonym / Elev";
    const userClass = genericClass.trim();

    let dueDateStr: string | null = null;
    const days = parseInt(genericDays) || 0;
    const hours = parseInt(genericHours) || 0;

    if (days > 0 || hours > 0) {
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + days);
      dueDate.setHours(dueDate.getHours() + hours);
      dueDateStr = dueDate.toISOString();
    }

    try {
      await invoke("checkout_generic_item", {
        category: genericCategory,
        userId: user,
        userClass: userClass,
        dueDate: dueDateStr,
      });
      setIsGenericLoanPopup(false);
      setGenericUser("");
      setGenericClass("");
      setGenericDays("");
      setGenericHours("");
      loadData();
    } catch (err) {
      alert("Feil ved generisk utlån: " + err);
    }
  };

  const handlePopupReturn = async (itemId: string) => {
    try {
      await invoke("return_item", { itemId: itemId });
      setPopupItem(null);
      loadData();
    } catch (err) {
      alert("Feil ved innlevering: " + err);
    }
  };

  const formatTimeLeft = (dueDateStr?: string | null) => {
    if (!dueDateStr) return "Ingen frist";

    const now = new Date().getTime();
    const due = new Date(dueDateStr).getTime();
    const diff = due - now;

    const formattedDate = new Date(dueDateStr).toLocaleString([], {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    if (diff < 0) {
      const overdueHours = Math.abs(Math.floor(diff / (1000 * 60 * 60)));
      const overdueDays = Math.floor(overdueHours / 24);
      if (overdueDays > 0) {
        return `${formattedDate} (Forsinket med ${overdueDays} dgr)`;
      }
      return `${formattedDate} (Forsinket med ${overdueHours} t)`;
    }

    const totalHours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(totalHours / 24);
    const hours = totalHours % 24;

    if (days > 0) {
      return `${formattedDate} (${days} dgr, ${hours} t igjen)`;
    }
    return `${formattedDate} (${hours} t igjen)`;
  };

  const totalItems = items.length;
  const rentedItems = items.filter((i) => i.is_rented).length;
  const availableItems = totalItems - rentedItems;

  const now = new Date().getTime();
  const overdueItems = items.filter(
    (i) => i.is_rented && i.due_date && new Date(i.due_date).getTime() < now
  ).length;

  const filteredItems = items.filter(
    (i) =>
      i.id.toLowerCase().includes(search.toLowerCase()) ||
      i.category.toLowerCase().includes(search.toLowerCase()) ||
      (i.current_user && i.current_user.toLowerCase().includes(search.toLowerCase())) ||
      (i.user_class && i.user_class.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div
      style={{
        padding: "30px 40px",
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        background: "#000000",
        color: "#ededed",
        minHeight: "100vh",
      }}
      onClick={() => {
        if (!popupItem && !isNewItemPopup && !itemToDelete && !isGenericLoanPopup && !isPrintPopupOpen) {
          scanInputRef.current?.focus();
        }
      }}
    >
      {/* CSS FOR LIGGENDE UDSKRIFT (LANDSCAPE) */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      `}</style>

      {/* HEADER */}
      <div style={{ marginBottom: "24px", borderBottom: "1px solid #222", paddingBottom: "16px" }}>
        <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#fff", letterSpacing: "-0.5px" }}>
          UTLÅNSSYSTEM // ADMIN
        </h1>
        <p style={{ margin: "4px 0 0 0", fontSize: "12px", color: "#777" }}>System for inventar, utlån og logg</p>
      </div>

      {/* STATISTIKK */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "12px", marginBottom: "24px" }}>
        <div style={{ background: "#050505", padding: "16px", border: "1px solid #222" }}>
          <div style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Totalt</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: "#fff", marginTop: "4px" }}>{totalItems}</div>
        </div>
        <div style={{ background: "#050505", padding: "16px", border: "1px solid #222" }}>
          <div style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Ledig</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: "#3fb950", marginTop: "4px" }}>{availableItems}</div>
        </div>
        <div style={{ background: "#050505", padding: "16px", border: "1px solid #222" }}>
          <div style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Utlånt</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: "#58a6ff", marginTop: "4px" }}>{rentedItems}</div>
        </div>
        <div style={{ background: "#050505", padding: "16px", border: "1px solid #222" }}>
          <div style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Forsinket</div>
          <div style={{ fontSize: "22px", fontWeight: "600", color: overdueItems > 0 ? "#f85149" : "#fff", marginTop: "4px" }}>
            {overdueItems}
          </div>
        </div>
      </div>

      {/* SKANNING OG UTLÅN */}
      <div style={{ background: "#050505", padding: "20px", border: "1px solid #222", marginBottom: "30px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px", flexWrap: "wrap", gap: "10px" }}>
          <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#fff" }}>Skann / Søk</h3>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={() => setIsGenericLoanPopup(true)}
              style={{
                padding: "6px 12px",
                background: "#1f1f1f",
                color: "#fff",
                border: "1px solid #333",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              + Utlån uten ID
            </button>
            <button
              onClick={() => {
                setIsPrintPopupOpen(true);
                generateUniqueBatch(labelSizeCm, printType);
              }}
              style={{
                padding: "6px 12px",
                background: "#1f1f1f",
                color: "#fff",
                border: "1px solid #333",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: "600",
                textTransform: "uppercase",
              }}
            >
              + Skriv ut ID-ark
            </button>
          </div>
        </div>
        <p style={{ margin: "0 0 14px 0", fontSize: "12px", color: "#777" }}>Skann strekkode / QR eller skriv ID:</p>

        <div style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "center" }}>
          <button
            onClick={() => {
              setCameraActive(!cameraActive);
              setCameraError(null);
            }}
            style={{
              padding: "8px 14px",
              background: cameraActive ? "#ff5555" : "#111",
              color: "#fff",
              border: "1px solid #333",
              cursor: "pointer",
              fontSize: "12px",
              fontWeight: "600",
              textTransform: "uppercase",
            }}
          >
            {cameraActive ? "Lukk Kamera" : "Start Kamera"}
          </button>
        </div>

        {cameraError && (
          <div style={{ marginBottom: "12px", padding: "10px 14px", background: "#1a0505", border: "1px solid #551111", color: "#ff7b72", fontSize: "12px" }}>
            {cameraError}
          </div>
        )}

        <div id="reader" style={{ width: "100%", maxWidth: "360px", display: cameraActive ? "block" : "none", marginBottom: "16px", border: "1px solid #333" }}></div>

        <form onSubmit={handleScanSubmit} style={{ display: "flex", gap: "10px" }}>
          <input
            ref={scanInputRef}
            placeholder="Skann/skriv ID..."
            value={scanInput}
            onChange={(e) => setScanInput(e.target.value)}
            style={{
              padding: "8px 12px",
              fontSize: "13px",
              flex: "1",
              background: "#000",
              color: "#fff",
              border: "1px solid #333",
              outline: "none",
            }}
          />
          <button type="submit" style={{ padding: "8px 16px", background: "#111", color: "#fff", border: "1px solid #333", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}>
            Søk
          </button>
        </form>
      </div>

      {/* INVENTARLISTE */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h3 style={{ margin: 0, fontSize: "14px", fontWeight: "600", color: "#fff" }}>Inventar</h3>
        <input
          placeholder="Filtrer..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ padding: "6px 12px", width: "180px", background: "#050505", color: "#fff", border: "1px solid #222", outline: "none", fontSize: "13px" }}
        />
      </div>

      <div style={{ border: "1px solid #222", background: "#050505", marginBottom: "40px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#0a0a0a", borderBottom: "1px solid #222", color: "#777", textTransform: "uppercase", fontSize: "11px" }}>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>ID</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Kategori</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Status</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Lånt til</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Frist</th>
              <th style={{ padding: "10px 16px", fontWeight: "600", textAlign: "right" }}>Valg</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const isOverdue = item.is_rented && item.due_date && new Date(item.due_date).getTime() < now;
              return (
                <tr key={item.id} style={{ borderBottom: "1px solid #141414" }}>
                  <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "#fff" }}>{item.id}</td>
                  <td style={{ padding: "10px 16px", color: "#aaa" }}>{item.category}</td>
                  <td style={{ padding: "10px 16px", color: item.is_rented ? (isOverdue ? "#f85149" : "#58a6ff") : "#3fb950", fontWeight: "600", fontSize: "11px", textTransform: "uppercase" }}>
                    {item.is_rented ? (isOverdue ? "Forsinket" : "Utlånt") : "Ledig"}
                  </td>
                  <td style={{ padding: "10px 16px", color: "#ccc" }}>
                    {item.current_user ? `${item.current_user} ${item.user_class ? `(${item.user_class})` : ""}` : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", color: isOverdue ? "#f85149" : "#777" }}>
                    {item.is_rented ? formatTimeLeft(item.due_date) : "—"}
                  </td>
                  <td style={{ padding: "10px 16px", textAlign: "right", display: "flex", gap: "8px", justifyContent: "flex-end", alignItems: "center" }}>
                    {item.is_rented && (
                      <button
                        onClick={() => handlePopupReturn(item.id)}
                        style={{
                          padding: "4px 8px",
                          background: "#1f2428",
                          color: "#58a6ff",
                          border: "1px solid #333",
                          cursor: "pointer",
                          fontSize: "11px",
                          fontWeight: "600",
                        }}
                      >
                        Lever
                      </button>
                    )}
                    <button
                      onClick={() => setItemToDelete(item)}
                      title="Slett"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#777",
                        cursor: "pointer",
                        fontSize: "14px",
                        padding: "4px 8px",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#f85149")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#777")}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "30px", textAlign: "center", color: "#555" }}>
                  Ingen treff.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* UTLÅNSHISTORIKK */}
      <h3 style={{ margin: "0 0 12px 0", fontSize: "14px", fontWeight: "600", color: "#fff" }}>Historikk</h3>
      <div style={{ border: "1px solid #222", background: "#050505" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "13px" }}>
          <thead>
            <tr style={{ background: "#0a0a0a", borderBottom: "1px solid #222", color: "#777", textTransform: "uppercase", fontSize: "11px" }}>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>ID</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Låntaker</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Utlånt</th>
              <th style={{ padding: "10px 16px", fontWeight: "600" }}>Frist</th>
            </tr>
          </thead>
          <tbody>
            {loans.map((loan) => (
              <tr key={loan.id} style={{ borderBottom: "1px solid #141414" }}>
                <td style={{ padding: "10px 16px", fontFamily: "monospace", color: "#fff" }}>{loan.item_id}</td>
                <td style={{ padding: "10px 16px", color: "#aaa" }}>
                  {loan.user_id} {loan.user_class ? `(${loan.user_class})` : ""}
                </td>
                <td style={{ padding: "10px 16px", color: "#777" }}>{loan.loan_date}</td>
                <td style={{ padding: "10px 16px", color: "#777" }}>
                  {loan.due_date
                    ? new Date(loan.due_date).toLocaleString([], {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "Ingen frist"}
                </td>
              </tr>
            ))}
            {loans.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: "30px", textAlign: "center", color: "#555" }}>
                  Ingen historikk.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* POPUP: SLETTING */}
      {itemToDelete && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div style={{ background: "#050505", padding: "24px", border: "1px solid #333", width: "360px" }}>
            <h3 style={{ margin: "0 0 10px 0", fontSize: "14px", fontWeight: "600", color: "#f85149", textTransform: "uppercase" }}>Bekreft sletting</h3>
            <p style={{ margin: "0 0 20px 0", fontSize: "13px", color: "#aaa" }}>
              Slette <strong style={{ color: "#fff" }}>{itemToDelete.id}</strong> ({itemToDelete.category})?
            </p>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: "9px", background: "#f85149", color: "#fff", border: "none", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}
              >
                Slett
              </button>
              <button
                onClick={() => setItemToDelete(null)}
                style={{ flex: 1, padding: "9px", background: "transparent", color: "#777", border: "1px solid #333", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}
              >
                Avbryt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP: UTLÅN UTEN ID */}
      {isGenericLoanPopup && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div style={{ background: "#050505", padding: "24px", border: "1px solid #333", width: "380px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#fff", textTransform: "uppercase" }}>Utlån uten ID</h3>
            <form onSubmit={handleGenericCheckout} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", color: "#777" }}>Type:</label>
                <select
                  value={genericCategory}
                  onChange={(e) => setGenericCategory(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px", colorScheme: "dark" }}
                >
                  <option value="Headset">Headset</option>
                  <option value="Lader">Lader</option>
                  <option value="PC">PC</option>
                  <option value="Kamera">Kamera</option>
                </select>
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", color: "#777" }}>Låntaker:</label>
                <input
                  required
                  placeholder="Navn..."
                  value={genericUser}
                  onChange={(e) => setGenericUser(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                />
              </div>

              <div>
                <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase", color: "#777" }}>Klasse:</label>
                <input
                  placeholder="Klasse..."
                  value={genericClass}
                  onChange={(e) => setGenericClass(e.target.value)}
                  style={{ width: "100%", padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                />
              </div>

              <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#777" }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase" }}>Dager:</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={genericDays}
                    onChange={(e) => setGenericDays(e.target.value)}
                    style={{ width: "100%", padding: "8px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase" }}>Timer:</label>
                  <input
                    type="number"
                    placeholder="0"
                    value={genericHours}
                    onChange={(e) => setGenericHours(e.target.value)}
                    style={{ width: "100%", padding: "8px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                  />
                </div>
              </div>

              <button type="submit" style={{ padding: "9px", background: "#111", color: "#fff", border: "1px solid #333", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase", marginTop: "6px" }}>
                Registrer
              </button>
            </form>

            <button onClick={() => setIsGenericLoanPopup(false)} style={{ marginTop: "10px", padding: "7px", background: "transparent", color: "#777", border: "1px solid #333", cursor: "pointer", width: "100%", fontSize: "12px", textTransform: "uppercase" }}>
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* POPUP: FULLSKJERM UTSKRIFT (LIGGENDE / HORISONTALT A4-ARK) */}
      {isPrintPopupOpen && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100vw", height: "100vh", background: "rgba(0,0,0,0.92)", display: "flex", flexDirection: "column", zIndex: 100, boxSizing: "border-box", overflow: "hidden" }}>
          
          {/* TOPP-KONTROLLER */}
          <div style={{ padding: "16px 24px", background: "#050505", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
              <h3 style={{ margin: 0, fontSize: "15px", fontWeight: "600", color: "#fff", textTransform: "uppercase" }}>Utskriftsvisning // Liggende A4-ark</h3>
              
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Format:</span>
                <select
                  value={printType}
                  onChange={(e) => {
                    const newType = e.target.value as "qr" | "barcode";
                    setPrintType(newType);
                    generateUniqueBatch(labelSizeCm, newType);
                  }}
                  style={{ padding: "4px 8px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "12px", colorScheme: "dark" }}
                >
                  <option value="qr">QR-kode (Kvadrat)</option>
                  <option value="barcode">Strekkode (Rektangel)</option>
                </select>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "11px", color: "#777", textTransform: "uppercase" }}>Størrelse ({labelSizeCm} cm):</span>
                <input
                  type="range"
                  min="1.5"
                  max="6"
                  step="0.5"
                  value={labelSizeCm}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLabelSizeCm(val);
                    generateUniqueBatch(val, printType);
                  }}
                  style={{ width: "120px", accentColor: "#58a6ff", cursor: "pointer" }}
                />
                <span style={{ fontSize: "12px", color: "#58a6ff", fontWeight: "600" }}>{calculateTotalFit(labelSizeCm, printType)} stk</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "10px" }}>
              <button
                onClick={() => window.print()}
                style={{ padding: "8px 16px", background: "#238636", color: "#fff", border: "none", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}
              >
                Skriv ut
              </button>
              <button
                onClick={() => setIsPrintPopupOpen(false)}
                style={{ padding: "8px 16px", background: "transparent", color: "#aaa", border: "1px solid #333", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}
              >
                Lukk
              </button>
            </div>
          </div>

          {/* HOVEDOMRÅDE: LIGGENDE (LANDSCAPE) A4-ARK VISUALISERING */}
          <div style={{ flex: 1, display: "flex", justifyContent: "center", alignItems: "center", padding: "15px", overflow: "hidden" }}>
            <div 
              style={{
                width: "297mm",
                height: "210mm",
                maxHeight: "calc(100vh - 90px)",
                maxWidth: "calc(100vw - 30px)",
                background: "#ffffff",
                color: "#000000",
                boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                padding: "5mm",
                boxSizing: "border-box",
                display: "flex",
                flexWrap: "wrap",
                alignContent: "flex-start",
                gap: "1.5mm",
                overflow: "hidden"
              }}
            >
              {generatedBatch.map((id) => {
                const itemWidth = printType === "barcode" ? `${labelSizeCm * 1.5}cm` : `${labelSizeCm}cm`;
                const itemHeight = `${labelSizeCm}cm`;

                return (
                  <div 
                    key={id} 
                    style={{ 
                      width: itemWidth,
                      height: itemHeight,
                      background: "#ffffff", 
                      border: "1px dashed #ccc", 
                      padding: "1mm", 
                      boxSizing: "border-box",
                      display: "flex", 
                      flexDirection: "column", 
                      justifyContent: "center",
                      alignItems: "center",
                      overflow: "hidden"
                    }}
                  >
                    {printType === "barcode" ? (
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%" }}>
                        <Barcode value={id} width={Math.max(0.8, labelSizeCm * 0.4)} height={Math.min(50, labelSizeCm * 12)} fontSize={0} displayValue={false} />
                      </div>
                    ) : (
                      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", boxSizing: "border-box" }}>
                        <QRCodeSVG value={id} style={{ width: "100%", height: "100%", maxWidth: "100%", maxHeight: "100%" }} level="M" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      )}

      {/* POPUP: ENHET */}
      {popupItem && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div style={{ background: "#050505", padding: "24px", border: "1px solid #333", width: "380px" }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: "14px", fontWeight: "600", color: "#fff", textTransform: "uppercase" }}>Enhet Funnet</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "13px", marginBottom: "20px", color: "#888" }}>
              <div>ID: <strong style={{ color: "#fff" }}>{popupItem.id}</strong></div>
              <div>Kategori: <strong style={{ color: "#fff" }}>{popupItem.category}</strong></div>
              <div>Status: <strong style={{ color: popupItem.is_rented ? "#58a6ff" : "#3fb950" }}>{popupItem.is_rented ? `Utlånt til ${popupItem.current_user}` : "Ledig"}</strong></div>
            </div>

            {!popupItem.is_rented ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "12px" }}>
                <input
                  ref={popupInputRef}
                  placeholder="Låntaker..."
                  value={loanUser}
                  onChange={(e) => setLoanUser(e.target.value)}
                  style={{ padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                />
                <input
                  placeholder="Klasse..."
                  value={loanClass}
                  onChange={(e) => setLoanClass(e.target.value)}
                  style={{ padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                />

                <div style={{ display: "flex", gap: "8px", fontSize: "13px", color: "#777" }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase" }}>Dager:</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={loanDays}
                      onChange={(e) => setLoanDays(e.target.value)}
                      style={{ width: "100%", padding: "8px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: "block", marginBottom: "4px", fontSize: "11px", textTransform: "uppercase" }}>Timer:</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={loanHours}
                      onChange={(e) => setLoanHours(e.target.value)}
                      style={{ width: "100%", padding: "8px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px" }}
                    />
                  </div>
                </div>

                <button onClick={handlePopupCheckout} style={{ padding: "9px", background: "#111", color: "#fff", border: "1px solid #333", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase", marginTop: "4px" }}>
                  Bekreft Utlån
                </button>
              </div>
            ) : (
              <div style={{ marginBottom: "12px" }}>
                <button onClick={() => handlePopupReturn(popupItem.id)} style={{ padding: "9px", background: "#111", color: "#fff", border: "1px solid #333", fontWeight: "600", cursor: "pointer", width: "100%", fontSize: "12px", textTransform: "uppercase" }}>
                  Lever Tilbake
                </button>
              </div>
            )}

            <button onClick={() => setPopupItem(null)} style={{ padding: "7px", background: "transparent", color: "#777", border: "1px solid #333", cursor: "pointer", width: "100%", fontSize: "12px", textTransform: "uppercase" }}>
              Avbryt
            </button>
          </div>
        </div>
      )}

      {/* POPUP: NY ID */}
      {isNewItemPopup && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 100 }}>
          <div style={{ background: "#050505", padding: "24px", border: "1px solid #333", width: "360px" }}>
            <h3 style={{ margin: "0 0 6px 0", fontSize: "14px", fontWeight: "600", color: "#fff", textTransform: "uppercase" }}>Ny ID Oppdaget</h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "12px", color: "#777" }}>
              ID <strong style={{ color: "#fff" }}>{newIdToRegister}</strong> finnes ikke. Velg type:
            </p>

            <form onSubmit={handleRegisterNew} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <select
                ref={popupSelectRef}
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                style={{ padding: "8px 12px", background: "#000", color: "#fff", border: "1px solid #333", outline: "none", fontSize: "13px", colorScheme: "dark" }}
              >
                <option value="PC">PC</option>
                <option value="Lader">Lader</option>
                <option value="Kamera">Kamera</option>
                <option value="Headset">Headset</option>
              </select>
              <button type="submit" style={{ padding: "9px", background: "#111", color: "#fff", border: "1px solid #333", fontWeight: "600", cursor: "pointer", fontSize: "12px", textTransform: "uppercase" }}>
                Lagre
              </button>
            </form>

            <button onClick={() => setIsNewItemPopup(false)} style={{ marginTop: "10px", padding: "7px", background: "transparent", color: "#777", border: "1px solid #333", cursor: "pointer", width: "100%", fontSize: "12px", textTransform: "uppercase" }}>
              Avbryt
            </button>
          </div>
        </div>
      )}
    </div>
  );
}