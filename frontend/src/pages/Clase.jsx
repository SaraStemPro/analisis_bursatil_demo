import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { lesson as lessonApi } from "../api";
import {
  TEST_DIVERSIFICACION,
  ABIERTAS_DIVERSIFICACION,
  TEST_GESTIONMON,
  ABIERTAS_GESTIONMON,
  TEST_CARTERAS,
  ABIERTAS_CARTERAS,
} from "./clase/evaluacion-data.js";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
  ReferenceDot,
} from "recharts";

// ════════════════════════════════════════════════════════════
//  CONFIGURACIÓN: enlaces a la plataforma
//  Cambia PLATAFORMA_URL si quieres apuntar a rutas internas
//  concretas (p. ej. .../cartera, .../analisis, etc.)
// ════════════════════════════════════════════════════════════

const PLATAFORMA_URL = "/screener";

// ════════════════════════════════════════════════════════════
//  PALETA · TIPOGRAFÍA
// ════════════════════════════════════════════════════════════

const C = {
  paper: "#F4EFE6",
  paperDark: "#EAE3D4",
  card: "#FFFCF5",
  ink: "#141210",
  inkSoft: "#3A332B",
  rule: "#D9D0BD",
  red: "#B33A1F",
  green: "#3F5E2A",
  gold: "#A37A28",
  blue: "#2C4A6B",
  muted: "#7A6E5A",
  highlight: "#FFF3D9",
};

const fontDisplay = `"Fraunces", "Times New Roman", serif`;
const fontBody = `"Manrope", system-ui, sans-serif`;
const fontMono = `"JetBrains Mono", "Courier New", monospace`;

const FontLoader = () => {
  useEffect(() => {
    const id = "lesson-fonts-cajasol-v2";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href =
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,700;9..144,900&family=Manrope:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap";
    document.head.appendChild(link);
  }, []);
  return null;
};

const num = (v, d = 2) =>
  new Intl.NumberFormat("es-ES", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(v);

const eur = (v) =>
  new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(v);

// ════════════════════════════════════════════════════════════
//  PERSISTENT STORAGE HELPERS
//  Cada alumno guarda sus notas/checks en su navegador.
// ════════════════════════════════════════════════════════════

const STORAGE_PREFIX = "leccion3:";
const LESSON_ID = "leccion3";

// Bus interno para que useStoredValue notifique al sync hook cuando cambian datos.
const lessonBus = (() => {
  const listeners = new Set();
  return {
    notify: () => listeners.forEach((l) => l()),
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
})();

// Recolecta TODO lo guardado bajo prefijo `leccion3:` desde localStorage.
const collectLessonData = () => {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(STORAGE_PREFIX)) {
        const subkey = k.slice(STORAGE_PREFIX.length);
        try {
          out[subkey] = JSON.parse(localStorage.getItem(k));
        } catch {
          out[subkey] = localStorage.getItem(k);
        }
      }
    }
  } catch { /* storage no disponible */ }
  return out;
};

const useStoredValue = (key, initial) => {
  const [value, setValue] = useState(() => {
    try {
      const v = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
      return v ? JSON.parse(v) : initial;
    } catch {
      return initial;
    }
  });

  const save = (v) => {
    setValue(v);
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(v));
      lessonBus.notify();
    } catch { /* quota exceeded */ }
  };

  return [value, save, true];
};

// Hidrata localStorage con los datos remotos del alumno ANTES de montar los
// componentes hijos (ellos leen localStorage de forma síncrona en su useState).
// Devuelve { ready, status } donde ready=true significa que ya se puede renderizar
// la lección y status sirve para el badge visual.
const useStudentLessonSync = (lessonId) => {
  const [status, setStatus] = useState("loading");
  const [ready, setReady] = useState(false);
  const debounceRef = useRef(null);
  const inFlightRef = useRef(false);
  const pendingRef = useRef(false);

  useEffect(() => {
    if (!localStorage.getItem("token")) {
      setStatus("offline");
      setReady(true);
      return;
    }
    let cancelled = false;
    lessonApi
      .getResponses(lessonId)
      .then((res) => {
        if (cancelled) return;
        if (res && res.data && typeof res.data === "object") {
          try {
            // Limpia keys locales antiguas que ya no existan en remoto
            const remoteKeys = new Set(Object.keys(res.data));
            const toDelete = [];
            for (let i = 0; i < localStorage.length; i++) {
              const k = localStorage.key(i);
              if (k && k.startsWith(STORAGE_PREFIX)) {
                const subkey = k.slice(STORAGE_PREFIX.length);
                if (!remoteKeys.has(subkey)) toDelete.push(k);
              }
            }
            toDelete.forEach((k) => localStorage.removeItem(k));
            // Vuelca todo lo remoto a localStorage
            Object.entries(res.data).forEach(([k, v]) => {
              localStorage.setItem(`${STORAGE_PREFIX}${k}`, JSON.stringify(v));
            });
          } catch { /* */ }
          setStatus("saved");
        } else {
          setStatus("idle");
        }
        setReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus("error");
        setReady(true);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // Auto-save con debounce ante cualquier cambio
  useEffect(() => {
    if (!ready) return;
    if (!localStorage.getItem("token")) return;

    const flush = () => {
      if (inFlightRef.current) {
        pendingRef.current = true;
        return;
      }
      const data = collectLessonData();
      inFlightRef.current = true;
      setStatus("saving");
      lessonApi
        .saveResponses(lessonId, data)
        .then(() => setStatus("saved"))
        .catch(() => setStatus("error"))
        .finally(() => {
          inFlightRef.current = false;
          if (pendingRef.current) {
            pendingRef.current = false;
            flush();
          }
        });
    };

    const onChange = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flush, 1500);
    };

    const unsub = lessonBus.subscribe(onChange);
    return () => {
      unsub();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [lessonId, ready]);

  return { ready, status };
};

// Badge visual del estado del autoguardado.
const SaveStatusBadge = ({ status }) => {
  const map = {
    idle: { label: "Sin cambios", color: C.muted, dot: C.muted },
    loading: { label: "Cargando respuestas…", color: C.muted, dot: C.gold },
    saving: { label: "Guardando…", color: C.gold, dot: C.gold },
    saved: { label: "Guardado en la nube", color: C.green, dot: C.green },
    error: { label: "Error al guardar — se conservan en este navegador", color: C.red, dot: C.red },
    offline: { label: "Sin sesión — guardado solo en este navegador", color: C.muted, dot: C.muted },
  };
  const s = map[status] || map.idle;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: fontMono,
        fontSize: 11,
        color: s.color,
        letterSpacing: "0.05em",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: s.dot,
          display: "inline-block",
        }}
      />
      {s.label}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  COMPONENTES BASE
// ════════════════════════════════════════════════════════════

const SectionHeader = ({ kicker, title, lead, n }) => (
  <header style={{ marginBottom: 36 }}>
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 16,
        marginBottom: 14,
      }}
    >
      {n && (
        <span
          style={{
            fontFamily: fontDisplay,
            fontSize: 56,
            fontWeight: 900,
            lineHeight: 0.9,
            color: C.gold,
            fontStyle: "italic",
          }}
        >
          {n}
        </span>
      )}
      <span
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {kicker}
      </span>
    </div>
    <h2
      style={{
        fontFamily: fontDisplay,
        fontSize: "clamp(30px, 4.5vw, 52px)",
        lineHeight: 1.02,
        fontWeight: 500,
        color: C.ink,
        margin: 0,
        letterSpacing: "-0.025em",
        maxWidth: 900,
      }}
    >
      {title}
    </h2>
    {lead && (
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 16,
          lineHeight: 1.6,
          color: C.inkSoft,
          maxWidth: 720,
          marginTop: 18,
          marginBottom: 0,
        }}
      >
        {lead}
      </p>
    )}
  </header>
);

const Card = ({ children, accent, style }) => (
  <div
    style={{
      background: C.card,
      border: `1px solid ${C.rule}`,
      borderTop: accent ? `3px solid ${accent}` : `1px solid ${C.rule}`,
      padding: 24,
      borderRadius: 2,
      ...style,
    }}
  >
    {children}
  </div>
);

const Label = ({ children, value, hint }) => (
  <div style={{ marginBottom: 14 }}>
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 6,
        gap: 8,
      }}
    >
      <label
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: C.muted,
        }}
      >
        {children}
      </label>
      {value !== undefined && (
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 14,
            fontWeight: 500,
            color: C.ink,
          }}
        >
          {value}
        </span>
      )}
    </div>
    {hint && (
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 11,
          color: C.muted,
          fontStyle: "italic",
          marginTop: 2,
        }}
      >
        {hint}
      </div>
    )}
  </div>
);

const Slider = ({ value, onChange, min, max, step = 1 }) => (
  <input
    type="range"
    value={value}
    min={min}
    max={max}
    step={step}
    onChange={(e) => onChange(parseFloat(e.target.value))}
    style={{ width: "100%", accentColor: C.ink, cursor: "pointer" }}
  />
);

const Stat = ({ label, value, sub, color = C.ink, big = false }) => (
  <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 12 }}>
    <div
      style={{
        fontFamily: fontMono,
        fontSize: 9,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: C.muted,
        marginBottom: 4,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: fontDisplay,
        fontSize: big ? 36 : 24,
        fontWeight: 500,
        color,
        lineHeight: 1,
        letterSpacing: "-0.02em",
      }}
    >
      {value}
    </div>
    {sub && (
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 11,
          color: C.muted,
          marginTop: 4,
        }}
      >
        {sub}
      </div>
    )}
  </div>
);

const Pull = ({ children, color = C.gold }) => (
  <blockquote
    style={{
      fontFamily: fontDisplay,
      fontSize: "clamp(20px, 2.4vw, 26px)",
      lineHeight: 1.3,
      fontStyle: "italic",
      fontWeight: 400,
      color: C.ink,
      borderLeft: `3px solid ${color}`,
      paddingLeft: 22,
      margin: "28px 0",
      letterSpacing: "-0.01em",
    }}
  >
    {children}
  </blockquote>
);

const Tag = ({ children, color = C.ink, filled }) => (
  <span
    style={{
      fontFamily: fontMono,
      fontSize: 10,
      letterSpacing: "0.12em",
      textTransform: "uppercase",
      color: filled ? C.card : color,
      background: filled ? color : "transparent",
      border: `1px solid ${color}`,
      padding: "4px 10px",
      borderRadius: 999,
      display: "inline-block",
      fontWeight: 500,
    }}
  >
    {children}
  </span>
);

const Body = ({ children, style }) => (
  <p
    style={{
      fontFamily: fontBody,
      fontSize: 15,
      lineHeight: 1.65,
      color: C.inkSoft,
      margin: "0 0 14px",
      ...style,
    }}
  >
    {children}
  </p>
);

const SubHead = ({ children, num, n, id }) => {
  const numero = n ?? num;
  return (
    <h3
      id={id}
      style={{
        fontFamily: fontDisplay,
        fontSize: 26,
        fontWeight: 500,
        color: C.ink,
        margin: "32px 0 14px",
        letterSpacing: "-0.02em",
        display: "flex",
        alignItems: "baseline",
        gap: 12,
        scrollMarginTop: 24,
      }}
    >
      {numero && (
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 13,
            color: C.gold,
            fontWeight: 700,
          }}
        >
          {numero}
        </span>
      )}
      {children}
    </h3>
  );
};

const Row = ({ k, v, c = C.ink }) => (
  <div style={{ display: "flex", justifyContent: "space-between" }}>
    <span style={{ color: C.muted }}>{k}</span>
    <span style={{ color: c, fontWeight: 700 }}>{v}</span>
  </div>
);

// ════════════════════════════════════════════════════════════
//  COMPONENTES PEDAGÓGICOS NUEVOS
// ════════════════════════════════════════════════════════════

// "En cristiano": explicación llana antes de la teoría
const EnCristiano = ({ children, titulo = "En cristiano" }) => (
  <div
    style={{
      background: C.highlight,
      border: `1px solid ${C.gold}`,
      borderLeft: `4px solid ${C.gold}`,
      padding: "16px 20px",
      margin: "16px 0 22px",
      position: "relative",
    }}
  >
    <div
      style={{
        fontFamily: fontMono,
        fontSize: 10,
        letterSpacing: "0.2em",
        textTransform: "uppercase",
        color: C.gold,
        marginBottom: 8,
        fontWeight: 700,
      }}
    >
      ✱ {titulo}
    </div>
    <div
      style={{
        fontFamily: fontDisplay,
        fontSize: 17,
        lineHeight: 1.5,
        color: C.ink,
        fontStyle: "italic",
        fontWeight: 400,
      }}
    >
      {children}
    </div>
  </div>
);

// Ejemplo numérico desglosado
const EjemploPasoAPaso = ({ titulo, pasos }) => (
  <div
    style={{
      background: C.card,
      border: `1px dashed ${C.ink}`,
      padding: 20,
      margin: "16px 0 22px",
    }}
  >
    <div
      style={{
        fontFamily: fontMono,
        fontSize: 10,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: C.muted,
        marginBottom: 12,
      }}
    >
      → Ejemplo numérico
    </div>
    <div
      style={{
        fontFamily: fontDisplay,
        fontSize: 17,
        fontWeight: 500,
        color: C.ink,
        marginBottom: 14,
        letterSpacing: "-0.01em",
      }}
    >
      {titulo}
    </div>
    <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
      {pasos.map((p, i) => (
        <li
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "28px 1fr",
            gap: 10,
            padding: "10px 0",
            borderTop: i > 0 ? `1px dotted ${C.rule}` : "none",
            alignItems: "baseline",
          }}
        >
          <span
            style={{
              fontFamily: fontDisplay,
              fontSize: 22,
              color: C.gold,
              fontStyle: "italic",
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            {i + 1}
          </span>
          <span
            style={{
              fontFamily: fontBody,
              fontSize: 13.5,
              color: C.inkSoft,
              lineHeight: 1.55,
            }}
            dangerouslySetInnerHTML={{ __html: p }}
          />
        </li>
      ))}
    </ol>
  </div>
);

// Bloque "Aplícalo en tu plataforma"
const AplicaEnPlataforma = ({ titulo, tareas, ruta }) => (
  <div
    style={{
      background: C.ink,
      color: C.paper,
      padding: 24,
      margin: "20px 0 28px",
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontFamily: fontDisplay,
          fontSize: 28,
          color: C.gold,
          lineHeight: 1,
        }}
      >
        ◉
      </span>
      <Tag color={C.gold}>Aplícalo en vuestra plataforma</Tag>
    </div>
    <h4
      style={{
        fontFamily: fontDisplay,
        fontSize: 22,
        fontWeight: 500,
        color: C.paper,
        margin: "0 0 14px",
        letterSpacing: "-0.02em",
      }}
    >
      {titulo}
    </h4>
    <ol style={{ margin: "0 0 18px", paddingLeft: 18, color: "#D9D0BD" }}>
      {tareas.map((t, i) => (
        <li
          key={i}
          style={{
            fontFamily: fontBody,
            fontSize: 14,
            lineHeight: 1.6,
            marginBottom: 6,
          }}
          dangerouslySetInnerHTML={{ __html: t }}
        />
      ))}
    </ol>
    <a
      href={PLATAFORMA_URL}
      style={{
        fontFamily: fontMono,
        fontSize: 11,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: C.ink,
        background: C.gold,
        padding: "10px 18px",
        textDecoration: "none",
        display: "inline-block",
        fontWeight: 700,
        border: `1px solid ${C.gold}`,
      }}
    >
      → Abrir mi plataforma {ruta && `· ${ruta}`}
    </a>
  </div>
);

// Reto / Ejercicio entregable
const Reto = ({ id, titulo, enunciado, pista }) => {
  const [resp, setResp] = useStoredValue(`reto:${id}`, "");
  const [hecho, setHecho] = useStoredValue(`reto-hecho:${id}`, false);
  const [verPista, setVerPista] = useState(false);

  return (
    <div
      style={{
        background: C.paperDark,
        border: `1px solid ${C.ink}`,
        padding: 22,
        margin: "20px 0",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Tag color={C.red}>Reto {id}</Tag>
          {hecho && <Tag color={C.green} filled>✓ Hecho</Tag>}
        </div>
        <button
          onClick={() => setHecho(!hecho)}
          style={{
            fontFamily: fontMono,
            fontSize: 10,
            letterSpacing: "0.1em",
            padding: "6px 12px",
            border: `1px solid ${hecho ? C.green : C.muted}`,
            background: "transparent",
            color: hecho ? C.green : C.muted,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {hecho ? "Marcar como pendiente" : "Marcar hecho"}
        </button>
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 18,
          fontWeight: 500,
          color: C.ink,
          marginBottom: 8,
          letterSpacing: "-0.01em",
        }}
      >
        {titulo}
      </div>
      <div
        style={{
          fontFamily: fontBody,
          fontSize: 14,
          lineHeight: 1.6,
          color: C.inkSoft,
          marginBottom: 12,
        }}
        dangerouslySetInnerHTML={{ __html: enunciado }}
      />
      {pista && (
        <div style={{ marginBottom: 12 }}>
          <button
            onClick={() => setVerPista(!verPista)}
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              padding: "5px 10px",
              border: `1px dashed ${C.gold}`,
              background: "transparent",
              color: C.gold,
              cursor: "pointer",
            }}
          >
            {verPista ? "Ocultar pista" : "💡 Ver pista"}
          </button>
          {verPista && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 14px",
                background: C.highlight,
                border: `1px solid ${C.gold}`,
                fontFamily: fontBody,
                fontSize: 13,
                color: C.inkSoft,
                fontStyle: "italic",
                lineHeight: 1.5,
              }}
              dangerouslySetInnerHTML={{ __html: pista }}
            />
          )}
        </div>
      )}
      <textarea
        value={resp}
        onChange={(e) => setResp(e.target.value)}
        placeholder="Escribe aquí tu respuesta… (se guarda automáticamente)"
        style={{
          width: "100%",
          minHeight: 70,
          fontFamily: fontMono,
          fontSize: 13,
          lineHeight: 1.5,
          padding: 12,
          border: `1px solid ${C.rule}`,
          background: C.card,
          color: C.ink,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

// Checkpoint "lo entiendo"
const Checkpoint = ({ id, children }) => {
  const [check, setCheck] = useStoredValue(`check:${id}`, false);
  return (
    <label
      style={{
        display: "flex",
        gap: 12,
        alignItems: "center",
        padding: "10px 14px",
        background: check ? C.highlight : C.card,
        border: `1px solid ${check ? C.gold : C.rule}`,
        margin: "8px 0",
        cursor: "pointer",
        transition: "all 0.15s ease",
      }}
    >
      <input
        type="checkbox"
        checked={check}
        onChange={(e) => setCheck(e.target.checked)}
        style={{ accentColor: C.ink, cursor: "pointer" }}
      />
      <span
        style={{
          fontFamily: fontBody,
          fontSize: 13.5,
          color: check ? C.ink : C.inkSoft,
          textDecoration: check ? "none" : "none",
          fontWeight: check ? 600 : 400,
        }}
      >
        {children}
      </span>
    </label>
  );
};

// Quiz con feedback
const Quiz = ({ id, pregunta, opciones, correcta, explicacion }) => {
  const [resp, setResp] = useStoredValue(`quiz:${id}`, null);
  const acertado = resp === correcta;
  const respondido = resp !== null;

  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.rule}`,
        padding: 20,
        margin: "12px 0",
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 8,
        }}
      >
        Pregunta {id}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 17,
          fontWeight: 500,
          color: C.ink,
          marginBottom: 14,
          letterSpacing: "-0.01em",
        }}
      >
        {pregunta}
      </div>
      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {opciones.map((op, i) => {
          const seleccionada = resp === i;
          const esCorrecta = i === correcta;
          let bg = C.card;
          let border = C.rule;
          let color = C.inkSoft;
          if (respondido) {
            if (seleccionada && esCorrecta) {
              bg = "#E0EBD4";
              border = C.green;
              color = C.green;
            } else if (seleccionada && !esCorrecta) {
              bg = "#FCE9E2";
              border = C.red;
              color = C.red;
            } else if (esCorrecta) {
              border = C.green;
              color = C.green;
            }
          }
          return (
            <button
              key={i}
              onClick={() => !respondido && setResp(i)}
              disabled={respondido}
              style={{
                fontFamily: fontBody,
                fontSize: 14,
                textAlign: "left",
                padding: "10px 14px",
                background: bg,
                border: `1px solid ${border}`,
                color,
                cursor: respondido ? "default" : "pointer",
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  fontFamily: fontMono,
                  fontWeight: 700,
                  marginRight: 10,
                }}
              >
                {String.fromCharCode(65 + i)}.
              </span>
              {op}
            </button>
          );
        })}
      </div>
      {respondido && (
        <div
          style={{
            padding: 14,
            background: acertado ? "#E0EBD4" : "#FCE9E2",
            border: `1px solid ${acertado ? C.green : C.red}`,
            fontFamily: fontBody,
            fontSize: 13,
            color: C.inkSoft,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: acertado ? C.green : C.red }}>
            {acertado ? "✓ Correcto." : "✗ Incorrecto."}
          </strong>{" "}
          {explicacion}
        </div>
      )}
      {respondido && (
        <button
          onClick={() => setResp(null)}
          style={{
            fontFamily: fontMono,
            fontSize: 10,
            letterSpacing: "0.12em",
            padding: "6px 10px",
            marginTop: 8,
            border: `1px solid ${C.muted}`,
            background: "transparent",
            color: C.muted,
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          Reintentar
        </button>
      )}
    </div>
  );
};

// Mi cuaderno: notas persistentes
const MiCuaderno = () => {
  const [nota, setNota] = useStoredValue("cuaderno:sesion3", "");
  const palabras = nota.trim() ? nota.trim().split(/\s+/).length : 0;

  return (
    <div
      style={{
        background: C.paperDark,
        border: `2px solid ${C.ink}`,
        padding: 28,
        marginTop: 32,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 14,
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <div>
          <Tag color={C.ink}>Cuaderno personal</Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 26,
              fontWeight: 500,
              color: C.ink,
              margin: "10px 0 4px",
              letterSpacing: "-0.02em",
            }}
          >
            ¿Qué te llevas de esta sesión?
          </h3>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: C.muted,
              fontStyle: "italic",
            }}
          >
            Escríbelo con tus palabras. Se guarda automáticamente en tu
            navegador.
          </div>
        </div>
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: "0.1em",
          }}
        >
          {palabras} palabras
        </div>
      </div>
      <textarea
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        placeholder={`Tres ideas que te llevas hoy:

1.
2.
3.

¿Qué cambiarías en la forma en que llevabas tu cartera antes?
¿Qué número (riesgo por operación, drawdown máximo, beta) vas a fijar como límite personal?`}
        style={{
          width: "100%",
          minHeight: 200,
          fontFamily: fontMono,
          fontSize: 13.5,
          lineHeight: 1.7,
          padding: 18,
          border: `1px solid ${C.rule}`,
          background: C.card,
          color: C.ink,
          resize: "vertical",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

// Aviso si storage no funciona
const StorageNotice = () => null;

// ════════════════════════════════════════════════════════════
//  HERO
// ════════════════════════════════════════════════════════════

const Hero = () => (
  <section
    style={{
      borderBottom: `1px solid ${C.rule}`,
      padding: "64px 0 56px",
      marginBottom: 48,
      position: "relative",
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 28,
        gap: 20,
        flexWrap: "wrap",
      }}
    >
      <div>
        <Tag color={C.red} filled>
          Bloque 3 · Análisis Bursátil
        </Tag>
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 11,
            color: C.muted,
            letterSpacing: "0.15em",
            marginTop: 14,
          }}
        >
          MÁSTER EN FINANZAS · INSTITUTO DE ESTUDIOS CAJASOL
        </div>
      </div>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          color: C.muted,
          textAlign: "right",
        }}
      >
        Lección interactiva
        <br />
        <span style={{ color: C.ink, fontWeight: 700 }}>v.3.0 · plataforma viva</span>
      </div>
    </div>

    <h1
      style={{
        fontFamily: fontDisplay,
        fontSize: "clamp(48px, 9vw, 112px)",
        lineHeight: 0.92,
        fontWeight: 500,
        color: C.ink,
        margin: 0,
        letterSpacing: "-0.04em",
      }}
    >
      Diversificación
      <br />
      <span style={{ fontStyle: "italic", color: C.gold }}>
        & Gestión de carteras
      </span>
    </h1>

    <div
      style={{
        marginTop: 36,
        display: "grid",
        gridTemplateColumns: "1.4fr 1fr",
        gap: 40,
        alignItems: "end",
      }}
    >
      <p
        style={{
          fontFamily: fontDisplay,
          fontSize: "clamp(18px, 1.8vw, 22px)",
          lineHeight: 1.45,
          color: C.inkSoft,
          margin: 0,
          fontWeight: 400,
          maxWidth: 720,
        }}
      >
        Una buena tesis de inversión sin gestión del riesgo es solo un
        comentario afortunado o desafortunado del mercado. En este bloque vas
        a aprender qué separa un <em style={{ color: C.ink }}>método</em> de
        una <em style={{ color: C.red }}>apuesta</em>: la disciplina
        cuantificada del tamaño, la exposición y el daño asumible.
      </p>
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 12,
          color: C.muted,
          lineHeight: 1.8,
          borderLeft: `1px solid ${C.rule}`,
          paddingLeft: 16,
        }}
      >
        <div>01 · Diversificación</div>
        <div>02 · Gestión monetaria</div>
        <div>03 · Gestión de carteras</div>
        <div>04 · Métricas de control</div>
      </div>
    </div>

    {/* Cómo usar la plantilla */}
    <div
      style={{
        marginTop: 48,
        padding: 24,
        background: C.card,
        border: `1px solid ${C.rule}`,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 24,
      }}
    >
      <div>
        <Tag color={C.gold}>Cómo usar esta plantilla</Tag>
      </div>
      {[
        {
          n: "01",
          t: "Lee la teoría llana",
          d: "Cada concepto se explica primero en cristiano. Luego viene la fórmula.",
        },
        {
          n: "02",
          t: "Toca los simuladores",
          d: "Cada calculadora reacciona en tiempo real. Mueve los sliders, no leas pasivamente.",
        },
        {
          n: "03",
          t: "Resuelve los retos",
          d: "Tus respuestas se guardan automáticamente. Es tu cuaderno personal.",
        },
        {
          n: "04",
          t: "Llévalo a tu plataforma",
          d: "Cada sección termina con un ejercicio para hacer en tu plataforma de trading real.",
        },
      ].map((x) => (
        <div key={x.n}>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 26,
              color: C.gold,
              fontStyle: "italic",
              fontWeight: 700,
              lineHeight: 1,
              marginBottom: 8,
            }}
          >
            {x.n}
          </div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 500,
              color: C.ink,
              marginBottom: 4,
            }}
          >
            {x.t}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12.5,
              color: C.inkSoft,
              lineHeight: 1.5,
            }}
          >
            {x.d}
          </div>
        </div>
      ))}
    </div>
  </section>
);

// ════════════════════════════════════════════════════════════
//  MÓDULO 1 · DIVERSIFICACIÓN
// ════════════════════════════════════════════════════════════

const NivelesDiversificacion = () => {
  const niveles = [
    {
      n: "01",
      t: "Por clase de activo",
      d: "Renta variable, renta fija, materias primas, liquidez. Cada clase reacciona distinto a inflación, tipos y crecimiento.",
      ej: "60% acciones + 30% bonos + 10% oro",
    },
    {
      n: "02",
      t: "Por región y divisa",
      d: "No tener todo en un solo país o moneda. Si España va mal, que tu cartera no dependa solo de España.",
      ej: "USA · Europa · Emergentes",
    },
    {
      n: "03",
      t: "Por sector y estilo",
      d: "Tecnología, energía, salud, consumo básico. También por estilo: growth (crecimiento) vs value (valor).",
      ej: "Tech + Energía + Defensivos",
    },
    {
      n: "04",
      t: "Por horizonte temporal",
      d: "Combinar posiciones de corto, medio y largo plazo. No depender de un único momento de mercado.",
      ej: "Trading · Swing · Buy & Hold",
    },
  ];
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 14,
        marginBottom: 28,
      }}
    >
      {niveles.map((x) => (
        <div
          key={x.n}
          style={{
            background: C.card,
            border: `1px solid ${C.rule}`,
            padding: 20,
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 32,
              color: C.gold,
              fontStyle: "italic",
              fontWeight: 700,
              lineHeight: 1,
              marginBottom: 10,
            }}
          >
            {x.n}
          </div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 18,
              fontWeight: 500,
              color: C.ink,
              marginBottom: 8,
              letterSpacing: "-0.01em",
            }}
          >
            {x.t}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              lineHeight: 1.5,
              color: C.inkSoft,
              marginBottom: 12,
            }}
          >
            {x.d}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              color: C.muted,
              letterSpacing: "0.08em",
              borderTop: `1px dashed ${C.rule}`,
              paddingTop: 8,
            }}
          >
            EJ. {x.ej}
          </div>
        </div>
      ))}
    </div>
  );
};

const CorrelationScale = () => (
  <div
    style={{
      background: C.paperDark,
      padding: 24,
      marginBottom: 28,
      border: `1px solid ${C.rule}`,
    }}
  >
    <div
      style={{
        fontFamily: fontMono,
        fontSize: 10,
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        color: C.muted,
        marginBottom: 16,
      }}
    >
      Lectura de la correlación · ρ ∈ [−1, +1]
    </div>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: 0,
        border: `1px solid ${C.ink}`,
      }}
    >
      {[
        {
          rho: "−1",
          t: "Opuestos",
          d: "Cuando A sube, B baja siempre. Cobertura perfecta. Reduce muchísimo el riesgo.",
          ej: "Oro vs. acciones (a veces)",
          color: C.green,
        },
        {
          rho: "0",
          t: "Independientes",
          d: "El movimiento de uno no dice nada sobre el otro. Buena diversificación.",
          ej: "Café brasileño vs. tipos en EE.UU.",
          color: C.blue,
        },
        {
          rho: "+1",
          t: "Idénticos",
          d: "Suben y bajan a la vez. NO hay diversificación real, solo apariencia.",
          ej: "Iberdrola vs. Endesa",
          color: C.red,
        },
      ].map((x, i) => (
        <div
          key={i}
          style={{
            padding: 18,
            background: C.card,
            borderRight: i < 2 ? `1px solid ${C.ink}` : "none",
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 56,
              fontWeight: 700,
              color: x.color,
              lineHeight: 1,
              fontStyle: "italic",
            }}
          >
            {x.rho}
          </div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 17,
              color: C.ink,
              fontWeight: 500,
              marginTop: 6,
              marginBottom: 6,
            }}
          >
            {x.t}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              color: C.inkSoft,
              lineHeight: 1.5,
              marginBottom: 8,
            }}
          >
            {x.d}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              color: C.muted,
              fontStyle: "italic",
            }}
          >
            ej. {x.ej}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        marginTop: 14,
        padding: "10px 14px",
        background: C.card,
        border: `1px dashed ${C.rule}`,
        fontFamily: fontMono,
        fontSize: 11,
        color: C.inkSoft,
        textAlign: "center",
      }}
    >
      Correlación = covarianza / (σ<sub>A</sub> × σ<sub>B</sub>)
    </div>
  </div>
);

const CorrelationLab = () => {
  const [volA, setVolA] = useState(20);
  const [volB, setVolB] = useState(15);
  const [wA, setWA] = useState(60);
  const [rho, setRho] = useState(0.3);

  const wB = 100 - wA;
  const wAd = wA / 100;
  const wBd = wB / 100;
  const sigmaA = volA / 100;
  const sigmaB = volB / 100;
  const varP =
    wAd * wAd * sigmaA * sigmaA +
    wBd * wBd * sigmaB * sigmaB +
    2 * wAd * wBd * sigmaA * sigmaB * rho;
  const sigmaP = Math.sqrt(Math.max(varP, 0)) * 100;
  const weightedAvg = wAd * volA + wBd * volB;
  const reduction = weightedAvg - sigmaP;

  const curve = useMemo(() => {
    const arr = [];
    for (let r = -1; r <= 1.001; r += 0.05) {
      const v =
        Math.sqrt(
          Math.max(
            wAd * wAd * sigmaA * sigmaA +
              wBd * wBd * sigmaB * sigmaB +
              2 * wAd * wBd * sigmaA * sigmaB * r,
            0
          )
        ) * 100;
      arr.push({
        rho: parseFloat(r.toFixed(2)),
        vol: parseFloat(v.toFixed(2)),
      });
    }
    return arr;
  }, [wA, volA, volB]);

  // Narrativa en vivo según la posición del punto dorado.
  const narrativa = useMemo(() => {
    const sigmaAt = (r) =>
      Math.sqrt(
        Math.max(
          wAd * wAd * sigmaA * sigmaA +
            wBd * wBd * sigmaB * sigmaB +
            2 * wAd * wBd * sigmaA * sigmaB * r,
          0
        )
      ) * 100;
    const sigmaAt0 = sigmaAt(0);
    const sigmaAtMin = sigmaAt(-1);
    const ahorroHasta0 = sigmaP - sigmaAt0;
    const ahorroMax = sigmaP - sigmaAtMin;
    const ahorroVsPerfecta = reduction;

    let estado;
    let estadoColor;
    if (rho >= 0.8) {
      estado =
        "Tu cartera está prácticamente concentrada: ambos activos se mueven casi igual, así que la diversificación apenas hace nada.";
      estadoColor = C.red;
    } else if (rho >= 0.5) {
      estado =
        "Tu cartera está solo parcialmente diversificada: los dos activos comparten gran parte de su movimiento.";
      estadoColor = C.gold;
    } else if (rho >= 0.2) {
      estado =
        "Tu cartera está diversificada de forma razonable: la correlación es positiva pero contenida.";
      estadoColor = C.blue;
    } else if (rho >= -0.2) {
      estado =
        "Tu cartera está bien diversificada: los dos activos se mueven de forma casi independiente.";
      estadoColor = C.green;
    } else {
      estado =
        "Tu cartera está casi en cobertura: los movimientos de uno tienden a cancelar los del otro.";
      estadoColor = C.green;
    }

    let accion;
    if (rho > 0.05) {
      accion = `Si bajaras la correlación a 0, ahorrarías otros ${num(
        ahorroHasta0,
        1
      )} puntos de volatilidad. Llegando al límite teórico (ρ = −1) llegarías a ${num(
        sigmaAtMin,
        1
      )}%.`;
    } else if (rho < -0.05) {
      accion = `Ya estás aprovechando correlación negativa: tu cartera ahorra ${num(
        ahorroVsPerfecta,
        1
      )} puntos frente a dos activos idénticos. Recuerda: ρ tan baja es muy poco común en mercados reales.`;
    } else {
      accion = `Estás en el rango habitual del mercado real (ρ ≈ 0). Bajar más la correlación es matemáticamente posible (hasta ${num(
        sigmaAtMin,
        1
      )}% con ρ = −1) pero rara vez ocurre con activos reales.`;
    }

    return { estado, estadoColor, accion };
  }, [rho, wA, volA, volB, sigmaP, reduction]);

  return (
    <Card accent={C.blue}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 32,
          alignItems: "stretch",
        }}
      >
        <div>
          <Tag color={C.blue}>Laboratorio · 2 activos</Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              margin: "12px 0 8px",
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            ¿Cuánto reduce el riesgo la correlación?
          </h3>
          <p
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: C.inkSoft,
              lineHeight: 1.5,
              marginBottom: 18,
            }}
          >
            <strong>Cómo se usa:</strong> imagina que tienes 2 acciones en
            cartera. Pon su volatilidad (lo que se mueven), su peso, y la
            correlación entre ellas. Verás la volatilidad <em>total</em> de tu
            cartera de 2 activos.
          </p>

          <Label value={`${volA}%`} hint="Cuánto se mueve A en un año">
            Volatilidad activo A
          </Label>
          <Slider value={volA} onChange={setVolA} min={5} max={50} />

          <Label value={`${volB}%`} hint="Cuánto se mueve B en un año">
            Volatilidad activo B
          </Label>
          <Slider value={volB} onChange={setVolB} min={5} max={50} />

          <div
            style={{
              margin: "10px 0 18px",
              padding: "12px 14px",
              background: C.paperDark,
              border: `1px solid ${C.rule}`,
              fontFamily: fontMono,
              fontSize: 11,
              color: C.inkSoft,
              lineHeight: 1.6,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 6,
              }}
            >
              Referencias del mundo real
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 2, columnGap: 12 }}>
              <span>Bonos del Tesoro USA (TLT)</span><span style={{ fontWeight: 700, color: C.green }}>~12%</span>
              <span>S&amp;P 500 (SPY)</span><span style={{ fontWeight: 700, color: C.green }}>~16%</span>
              <span>Acción típica (IBE, MSFT)</span><span style={{ fontWeight: 700, color: C.blue }}>22–28%</span>
              <span>Tesla, Nvidia</span><span style={{ fontWeight: 700, color: C.gold }}>40–50%</span>
              <span>Criptomonedas</span><span style={{ fontWeight: 700, color: C.red }}>70%+</span>
            </div>
            <div
              style={{
                fontSize: 10,
                fontStyle: "italic",
                color: C.muted,
                marginTop: 8,
                lineHeight: 1.4,
              }}
            >
              El slider llega hasta 50% a propósito: lo que está más allá no se diversifica con dos activos, se gestiona con tamaño de posición.
            </div>
          </div>

          <Label value={`${wA}% / ${wB}%`} hint="Peso de A vs B">
            Pesos
          </Label>
          <Slider value={wA} onChange={setWA} min={0} max={100} />

          <Label
            value={rho.toFixed(2)}
            hint="−1 opuestos · 0 independientes · +1 idénticos"
          >
            Correlación ρ
          </Label>
          <Slider value={rho} onChange={setRho} min={-1} max={1} step={0.05} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 18,
          }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              padding: "16px 0",
              borderTop: `1px solid ${C.rule}`,
              borderBottom: `1px solid ${C.rule}`,
            }}
          >
            <Stat
              label="Vol. cartera"
              value={`${num(sigmaP, 1)}%`}
              color={C.blue}
              big
            />
            <Stat
              label="Si ρ = +1"
              value={`${num(weightedAvg, 1)}%`}
              sub="(media ponderada)"
              color={C.muted}
            />
            <Stat
              label="Ahorro"
              value={`−${num(reduction, 1)}%`}
              sub="vs. ρ = +1"
              color={C.green}
            />
          </div>

          <div>
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 8,
              }}
            >
              Volatilidad de la cartera vs. correlación
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={curve}>
                <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                <XAxis
                  dataKey="rho"
                  tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                  stroke={C.rule}
                  ticks={[-1, -0.5, 0, 0.5, 1]}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                  stroke={C.rule}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    fontFamily: fontMono,
                    fontSize: 12,
                    borderRadius: 0,
                  }}
                  formatter={(v) => [`${v}%`, "Vol. cartera"]}
                  labelFormatter={(l) => `ρ = ${l}`}
                />
                <Line
                  type="monotone"
                  dataKey="vol"
                  stroke={C.blue}
                  strokeWidth={2}
                  dot={false}
                />
                <ReferenceDot
                  x={parseFloat(rho.toFixed(2))}
                  y={parseFloat(sigmaP.toFixed(2))}
                  r={6}
                  fill={C.gold}
                  stroke={C.ink}
                  strokeWidth={1.5}
                />
              </LineChart>
            </ResponsiveContainer>
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 11,
                color: C.muted,
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              Punto dorado = tu cartera. Cuanto más a la izquierda
              (correlación negativa), menor riesgo total.
            </div>

            <div
              style={{
                marginTop: 14,
                padding: "14px 16px",
                background: C.paperDark,
                borderLeft: `3px solid ${narrativa.estadoColor}`,
                fontFamily: fontDisplay,
                fontSize: 14,
                lineHeight: 1.5,
                color: C.ink,
              }}
            >
              <div
                style={{
                  fontFamily: fontMono,
                  fontSize: 9,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: C.muted,
                  marginBottom: 6,
                }}
              >
                ↳ Lectura en vivo
              </div>
              <span style={{ fontWeight: 500 }}>{narrativa.estado}</span>{" "}
              <span style={{ color: C.inkSoft }}>{narrativa.accion}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};

const CasosPracticos = () => {
  const [caso, setCaso] = useState(0);
  const casos = [
    {
      titulo: "2020–2022 · Tecnología vs. resto",
      sub: "Diversificación por sectores",
      data: [
        { año: "2020", tech: 43, energia: -33, defensivos: 8 },
        { año: "2021", tech: 27, energia: 53, defensivos: 18 },
        { año: "2022", tech: -33, energia: 65, defensivos: -2 },
      ],
      moraleja:
        "Una cartera concentrada en tecnología vivió el cielo en 2020–21 y la quema en 2022. Quien tenía energía y defensivos amortiguó la caída. La diversificación no se ve hasta que llega la crisis.",
      keys: [
        { k: "tech", c: C.red, l: "Nasdaq 100" },
        { k: "energia", c: C.gold, l: "Energía" },
        { k: "defensivos", c: C.green, l: "Defensivos" },
      ],
    },
    {
      titulo: "Diversificación FALSA por factor",
      sub: "20 acciones, 1 sola fuente de riesgo",
      data: [
        { año: "2021 H1", tech: 18, growthEU: 16, growthEM: 20 },
        { año: "2021 H2", tech: 14, growthEU: 11, growthEM: 8 },
        { año: "2022 H1", tech: -28, growthEU: -25, growthEM: -22 },
        { año: "2022 H2", tech: -8, growthEU: -6, growthEM: -10 },
      ],
      moraleja:
        "Tener 20 acciones de growth en USA, Europa y emergentes parece diversificación. NO lo es: todas comparten el mismo factor de riesgo (sensibilidad a tipos). En 2022 cayeron a la vez.",
      keys: [
        { k: "tech", c: C.red, l: "Growth USA" },
        { k: "growthEU", c: C.gold, l: "Growth EU" },
        { k: "growthEM", c: C.blue, l: "Growth EM" },
      ],
    },
    {
      titulo: "Efecto divisa para inversor en €",
      sub: "S&P 500 con/sin cobertura EUR",
      data: [
        { año: "2021", spUSD: 27, spEUR: 39 },
        { año: "2022", spUSD: -18, spEUR: -13 },
        { año: "2023", spUSD: 24, spEUR: 21 },
        { año: "2024", spUSD: 23, spEUR: 31 },
      ],
      moraleja:
        "Cuando el dólar se fortalece, el inversor en € gana extra. Cuando se debilita, pierde rentabilidad. La divisa es una fuente de riesgo silenciosa que puede dominar el resultado.",
      keys: [
        { k: "spUSD", c: C.muted, l: "S&P 500 (USD)" },
        { k: "spEUR", c: C.green, l: "S&P 500 (EUR)" },
      ],
    },
    {
      titulo: "Marzo 2020 · cuando todo cae junto",
      sub: "Evento de cola: las correlaciones convergen a 1",
      data: [
        { activo: "S&P 500 (SPY)", caida: -15 },
        { activo: "Oro (GLD)", caida: -9 },
        { activo: "Bonos USA largos (TLT)", caida: -8 },
        { activo: "Bitcoin (BTC-USD)", caida: -38 },
        { activo: "Petróleo (USO)", caida: -23 },
      ],
      moraleja:
        "Semana del 9-13 marzo 2020: en pocos días los inversores vendieron TODO indiscriminadamente para captar liquidez. Hasta el oro y los bonos —típicamente refugios— cayeron. La diversificación es una herramienta del 95% del tiempo. Para el 5% restante (eventos de cola) hace falta otra cosa: cobertura, liquidez, plan predefinido.",
      keys: [{ k: "caida", c: C.red, l: "Caída semanal (%)" }],
      isHorizontal: true,
    },
  ];

  const c = casos[caso];

  return (
    <Card accent={C.gold}>
      <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
        {casos.map((x, i) => (
          <button
            key={i}
            onClick={() => setCaso(i)}
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "8px 14px",
              border: `1px solid ${caso === i ? C.ink : C.rule}`,
              background: caso === i ? C.ink : "transparent",
              color: caso === i ? C.card : C.inkSoft,
              cursor: "pointer",
              borderRadius: 0,
              fontWeight: 500,
            }}
          >
            Caso {i + 1}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1.3fr 1fr",
          gap: 28,
          alignItems: "start",
        }}
      >
        <div>
          <Tag color={C.gold}>{c.sub}</Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              margin: "12px 0 16px",
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            {c.titulo}
          </h3>
          <ResponsiveContainer width="100%" height={c.isHorizontal ? 280 : 250}>
            {c.isHorizontal ? (
              <BarChart data={c.data} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                  stroke={C.rule}
                  unit="%"
                />
                <YAxis
                  type="category"
                  dataKey="activo"
                  tick={{ fontSize: 10, fontFamily: fontMono, fill: C.inkSoft }}
                  stroke={C.rule}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    fontFamily: fontMono,
                    fontSize: 12,
                    borderRadius: 0,
                  }}
                  formatter={(v) => [`${v}%`, ""]}
                />
                <ReferenceLine x={0} stroke={C.ink} strokeWidth={1} />
                <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
                {c.keys.map((k) => (
                  <Bar key={k.k} dataKey={k.k} name={k.l} fill={k.c} />
                ))}
              </BarChart>
            ) : (
              <BarChart data={c.data}>
                <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
                <XAxis
                  dataKey="año"
                  tick={{ fontSize: 11, fontFamily: fontMono, fill: C.muted }}
                  stroke={C.rule}
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                  stroke={C.rule}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: C.paper,
                    border: `1px solid ${C.ink}`,
                    fontFamily: fontMono,
                    fontSize: 12,
                    borderRadius: 0,
                  }}
                  formatter={(v) => [`${v}%`, ""]}
                />
                <ReferenceLine y={0} stroke={C.ink} strokeWidth={1} />
                <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
                {c.keys.map((k) => (
                  <Bar key={k.k} dataKey={k.k} name={k.l} fill={k.c} />
                ))}
              </BarChart>
            )}
          </ResponsiveContainer>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 10,
              color: C.muted,
              fontStyle: "italic",
              textAlign: "right",
              marginTop: 4,
            }}
          >
            Datos ilustrativos con fines didácticos
          </div>
        </div>

        <div
          style={{
            background: C.paperDark,
            padding: 22,
            border: `1px dashed ${C.ink}`,
          }}
        >
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 10,
            }}
          >
            ↳ Lo que enseña este caso
          </div>
          <p
            style={{
              fontFamily: fontDisplay,
              fontSize: 17,
              lineHeight: 1.4,
              color: C.ink,
              margin: 0,
              fontStyle: "italic",
              fontWeight: 400,
            }}
          >
            {c.moraleja}
          </p>
        </div>
      </div>
    </Card>
  );
};

// Plantillas de cartera para experimentar en el screener
const PlantillasCartera = () => {
  const [activa, setActiva] = useState(0);
  const navigate = useNavigate();
  const plantillas = [
    {
      nombre: "Concentrada · 'Big Tech'",
      tag: "Pésima diversificación",
      tagColor: C.red,
      tickers: ["AAPL", "MSFT", "GOOGL", "META", "NVDA"],
      esperado: {
        corr: "≈ 0,55–0,80",
        dr: "≈ 1,10–1,20",
        veredicto: "Atención / Peligro",
      },
      moraleja:
        "Cinco mega-caps tech del S&P 500. Comparten exposición a tipos, narrativa de IA y sentimiento growth. La correlación dependerá del periodo, pero suele estar alta. Sirve para ver qué pasa cuando concentras.",
    },
    {
      nombre: "Sectorial USA",
      tag: "Diversificación moderada",
      tagColor: C.gold,
      tickers: ["AAPL", "JPM", "XOM", "JNJ", "PG"],
      esperado: {
        corr: "≈ 0,30–0,55",
        dr: "≈ 1,30–1,45",
        veredicto: "Buena",
      },
      moraleja:
        "Un nombre por sector: tech (AAPL), finanzas (JPM), energía (XOM), salud (JNJ), consumo defensivo (PG). Misma región y divisa, pero negocios muy distintos. La correlación cae respecto a la cartera tech.",
    },
    {
      nombre: "Multi-clase clásica",
      tag: "Diversificación real",
      tagColor: C.blue,
      tickers: ["SPY", "TLT", "GLD", "XLE", "EEM"],
      esperado: {
        corr: "≈ 0,15–0,35",
        dr: "≈ 1,40–1,70",
        veredicto: "Buena / Excelente",
      },
      moraleja:
        "Acciones (SPY), bonos largos (TLT), oro (GLD), energía (XLE), emergentes (EEM). Clases de activo y factores de riesgo muy distintos. TLT puede tener correlación NEGATIVA con SPY en algunos periodos. Mira el heatmap.",
    },
    {
      nombre: "Ibérica concentrada",
      tag: "Diversificación falsa",
      tagColor: C.red,
      tickers: ["IBE.MC", "SAN.MC", "ITX.MC", "TEF.MC", "BBVA.MC"],
      esperado: {
        corr: "≈ 0,55–0,75",
        dr: "≈ 1,10–1,25",
        veredicto: "Atención",
      },
      moraleja:
        "5 acciones del IBEX 35 distintas. Parece diversificado: 5 sectores diferentes. Pero todas comparten exposición a España, euro y prima de riesgo española. Cuando hay nervios sobre España, caen juntas.",
    },
  ];

  const p = plantillas[activa];

  return (
    <Card accent={C.gold}>
      <Tag color={C.gold}>Plantillas para experimentar</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        4 carteras tipo · cópialas en tu Screener
      </h3>
      <Body style={{ fontSize: 13, marginBottom: 18 }}>
        <strong>Cómo se usa:</strong> elige una plantilla, copia los tickers,
        pégalos en el simulador de tu Screener y pulsa <em>Calcular
        correlación</em>. Verás con datos reales por qué unas son
        "diversificación falsa" y otras "real". Anota tus resultados.
      </Body>

      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {plantillas.map((x, i) => (
          <button
            key={i}
            onClick={() => setActiva(i)}
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "10px 14px",
              border: `1px solid ${activa === i ? C.ink : C.rule}`,
              background: activa === i ? C.ink : "transparent",
              color: activa === i ? C.card : C.inkSoft,
              cursor: "pointer",
              borderRadius: 0,
              fontWeight: 500,
              flex: "1 1 160px",
              textAlign: "left",
            }}
          >
            {x.nombre}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "stretch",
        }}
      >
        <div
          style={{
            background: C.paperDark,
            border: `1px solid ${C.ink}`,
            padding: 22,
          }}
        >
          <Tag color={p.tagColor}>{p.tag}</Tag>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 22,
              fontWeight: 500,
              color: C.ink,
              margin: "10px 0 16px",
              letterSpacing: "-0.02em",
            }}
          >
            {p.nombre}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 8,
            }}
          >
            Tickers a copiar
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              marginBottom: 14,
            }}
          >
            {p.tickers.map((t) => (
              <span
                key={t}
                style={{
                  fontFamily: fontMono,
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.ink,
                  background: C.card,
                  padding: "5px 10px",
                  border: `1px solid ${C.ink}`,
                  letterSpacing: "0.05em",
                }}
              >
                {t}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={() => {
                navigate(
                  `/screener?tickers=${encodeURIComponent(
                    p.tickers.join(",")
                  )}`
                );
              }}
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "8px 14px",
                border: `1px solid ${C.ink}`,
                background: C.gold,
                color: C.ink,
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              → Probar en el Screener
            </button>
            <button
              onClick={() => {
                navigator.clipboard?.writeText(p.tickers.join(", "));
              }}
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                padding: "8px 14px",
                border: `1px solid ${C.ink}`,
                background: "transparent",
                color: C.ink,
                cursor: "pointer",
                fontWeight: 500,
              }}
            >
              ⎘ Copiar tickers
            </button>
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 10,
            }}
          >
            Lo que cabe esperar
          </div>
          <div
            style={{
              display: "grid",
              gap: 10,
              fontFamily: fontMono,
              fontSize: 13,
              marginBottom: 16,
            }}
          >
            <Row k="Correlación media" v={p.esperado.corr} c={C.ink} />
            <Row k="Diversification ratio" v={p.esperado.dr} c={C.ink} />
            <Row k="Veredicto" v={p.esperado.veredicto} c={p.tagColor} />
          </div>
          <div
            style={{
              padding: 16,
              background: C.card,
              border: `1px dashed ${C.ink}`,
              fontFamily: fontDisplay,
              fontSize: 15,
              color: C.ink,
              lineHeight: 1.5,
              fontStyle: "italic",
            }}
          >
            {p.moraleja}
          </div>
        </div>
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  MÓDULO 2 · GESTIÓN MONETARIA
// ════════════════════════════════════════════════════════════

const TamañoPosicion = () => {
  const [capital, setCapital] = useState(20000);
  const [riesgoPct, setRiesgoPct] = useState(1);
  const [precioEntrada, setPrecioEntrada] = useState(100);
  const [precioStop, setPrecioStop] = useState(95);

  const distancia = Math.abs(precioEntrada - precioStop);
  const distanciaPct = precioEntrada > 0 ? (distancia / precioEntrada) * 100 : 0;
  const riesgoMonetario = capital * (riesgoPct / 100);
  const acciones = distancia > 0 && precioEntrada > 0 ? Math.floor(riesgoMonetario / distancia) : 0;
  const exposicion = acciones * precioEntrada;
  const exposicionPct = capital > 0 ? (exposicion / capital) * 100 : 0;

  return (
    <Card accent={C.red}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.2fr",
          gap: 32,
        }}
      >
        <div>
          <Tag color={C.red}>Calculadora · Riesgo por operación</Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              margin: "12px 0 8px",
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            ¿Cuántas acciones puedo comprar?
          </h3>
          <Body style={{ fontSize: 13, marginBottom: 8 }}>
            <strong>Cómo se usa:</strong> antes de cada operación, decide
            cuánto dinero estás dispuesto a perder si te equivocas y salta el
            stop. Pon tu capital, el % de riesgo, el precio de entrada y dónde
            pondrías el stop. La calculadora te dice <strong>el número
            exacto</strong> de acciones a comprar.
          </Body>

          <Label value={eur(capital)}>Capital de la cuenta</Label>
          <Slider
            value={capital}
            onChange={setCapital}
            min={5000}
            max={100000}
            step={1000}
          />

          <Label
            value={`${riesgoPct.toFixed(2)}%`}
            hint="Recomendado profesional: 0,5%–2% por operación"
          >
            % riesgo por operación
          </Label>
          <Slider
            value={riesgoPct}
            onChange={setRiesgoPct}
            min={0.25}
            max={5}
            step={0.25}
          />

          <Label value={`${num(precioEntrada, 2)} €`}>Precio de entrada</Label>
          <Slider
            value={precioEntrada}
            onChange={setPrecioEntrada}
            min={0}
            max={2000}
            step={1}
          />

          <Label
            value={`${num(precioStop, 2)} € (a ${num(distanciaPct, 1)}%)`}
            hint="En zona de soporte/resistencia más cercana"
          >
            Precio del stop
          </Label>
          <Slider
            value={precioStop}
            onChange={setPrecioStop}
            min={0}
            max={Math.max(precioEntrada, 1)}
            step={0.5}
          />
        </div>

        <div
          style={{
            background: C.paperDark,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            border: `1px solid ${C.ink}`,
          }}
        >
          <div>
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 8,
              }}
            >
              Resultado
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 88,
                fontWeight: 700,
                color: C.ink,
                lineHeight: 0.9,
                letterSpacing: "-0.04em",
              }}
            >
              {acciones}
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 18,
                color: C.inkSoft,
                fontStyle: "italic",
                marginTop: 4,
              }}
            >
              acciones a comprar
            </div>
          </div>

          <div
            style={{
              borderTop: `1px solid ${C.ink}`,
              marginTop: 20,
              paddingTop: 16,
              display: "grid",
              gap: 10,
              fontFamily: fontMono,
              fontSize: 12,
            }}
          >
            <Row k="Riesgo €" v={eur(riesgoMonetario)} c={C.red} />
            <Row k="Distancia al stop" v={`${num(distancia, 2)} €`} />
            <Row k="Exposición total" v={eur(exposicion)} />
            <Row
              k="% del capital expuesto"
              v={`${num(exposicionPct, 1)}%`}
              c={C.gold}
            />
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              background: C.card,
              fontFamily: fontMono,
              fontSize: 11,
              color: C.inkSoft,
              border: `1px dashed ${C.muted}`,
              lineHeight: 1.5,
            }}
          >
            <strong>Fórmula:</strong> nº acciones = (Capital × %riesgo) /
            distancia al stop
          </div>
        </div>
      </div>
    </Card>
  );
};

const EsperanzaMatematica = () => {
  const [winRate, setWinRate] = useState(40);
  const [avgWin, setAvgWin] = useState(300);
  const [avgLoss, setAvgLoss] = useState(100);
  const [n, setN] = useState(100);

  const lossRate = 100 - winRate;
  const E = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;
  const RR = avgWin / avgLoss;
  const totalEsperado = E * n;

  const simulacion = useMemo(() => {
    const arr = [{ op: 0, capital: 0 }];
    let cap = 0;
    let seed = 42;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };
    for (let i = 1; i <= n; i++) {
      const r = rng();
      if (r < winRate / 100) cap += avgWin;
      else cap -= avgLoss;
      arr.push({ op: i, capital: cap, esperado: E * i });
    }
    return arr;
  }, [winRate, avgWin, avgLoss, n]);

  const positivo = E > 0;

  return (
    <Card accent={positivo ? C.green : C.red}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: 32,
        }}
      >
        <div>
          <Tag color={positivo ? C.green : C.red}>
            {positivo ? "Sistema GANADOR" : "Sistema PERDEDOR"}
          </Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              margin: "12px 0 8px",
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            La esperanza matemática
          </h3>
          <Body style={{ fontSize: 13, marginBottom: 18 }}>
            <strong>Cómo se usa:</strong> mete los datos REALES de tus últimas
            50 operaciones (% aciertos, ganancia media cuando ganas, pérdida
            media cuando pierdes). El sistema te dice si, repitiendo eso 100,
            500 ó 1.000 veces, acabas en verde o en rojo.
          </Body>

          <Label value={`${winRate}%`} hint="De cada 10 operaciones, cuántas ganas">
            % operaciones ganadoras
          </Label>
          <Slider value={winRate} onChange={setWinRate} min={20} max={80} />

          <Label value={eur(avgWin)} hint="Beneficio típico cuando aciertas">
            Ganancia media
          </Label>
          <Slider
            value={avgWin}
            onChange={setAvgWin}
            min={50}
            max={1000}
            step={25}
          />

          <Label value={eur(avgLoss)} hint="Pérdida típica cuando fallas">
            Pérdida media
          </Label>
          <Slider
            value={avgLoss}
            onChange={setAvgLoss}
            min={50}
            max={1000}
            step={25}
          />

          <Label value={`${n} operaciones`}>Tamaño de la muestra</Label>
          <Slider value={n} onChange={setN} min={20} max={500} step={10} />

          <div
            style={{
              marginTop: 18,
              padding: "16px 18px",
              background: C.paperDark,
              border: `1px solid ${C.ink}`,
              fontFamily: fontBody,
              fontSize: 13,
              color: C.inkSoft,
              lineHeight: 1.65,
            }}
          >
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: C.muted,
                marginBottom: 10,
              }}
            >
              Fórmula y leyenda
            </div>
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 14,
                color: C.ink,
                fontWeight: 700,
                marginBottom: 10,
              }}
            >
              E = (P<sub>ganar</sub> × G̅) − (P<sub>perder</sub> × L̅)
            </div>
            <div style={{ marginBottom: 12 }}>
              <span style={{ color: C.gold, fontFamily: fontMono, fontWeight: 700 }}>P<sub>ganar</sub></span> · probabilidad de acertar (tu win rate)
              <br />
              <span style={{ color: C.gold, fontFamily: fontMono, fontWeight: 700 }}>G̅</span> · ganancia media cuando aciertas
              <br />
              <span style={{ color: C.gold, fontFamily: fontMono, fontWeight: 700 }}>P<sub>perder</sub></span> · 1 − P<sub>ganar</sub> (probabilidad de fallar)
              <br />
              <span style={{ color: C.gold, fontFamily: fontMono, fontWeight: 700 }}>L̅</span> · pérdida media cuando fallas
            </div>

            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: C.muted,
                marginTop: 14,
                marginBottom: 8,
              }}
            >
              Sustituyendo con tus valores
            </div>
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 12.5,
                color: C.ink,
                lineHeight: 1.7,
                background: C.card,
                padding: "10px 12px",
                border: `1px dashed ${C.rule}`,
              }}
            >
              E = ({(winRate / 100).toFixed(2)} × {avgWin}) − ({(lossRate / 100).toFixed(2)} × {avgLoss})
              <br />
              &nbsp;&nbsp;= {((winRate / 100) * avgWin).toFixed(0)} − {((lossRate / 100) * avgLoss).toFixed(0)}
              <br />
              &nbsp;&nbsp;= <strong style={{ color: positivo ? C.green : C.red }}>{E >= 0 ? "+" : ""}{num(E, 2)} €</strong> por operación
            </div>

            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: C.muted,
                marginTop: 14,
                marginBottom: 6,
              }}
            >
              Ratio R/R · Reward / Risk
            </div>
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 12.5,
                color: C.ink,
                lineHeight: 1.65,
              }}
            >
              R/R = G̅ / L̅ = {avgWin} / {avgLoss} = <strong style={{ color: C.gold }}>{num(RR, 2)}</strong>
              <div style={{ fontFamily: fontBody, fontSize: 12, color: C.inkSoft, marginTop: 4, fontStyle: "italic" }}>
                {RR >= 1
                  ? `Ganas ${num(RR, 2)} € por cada 1 € que arriesgas.`
                  : `Por cada 1 € que arriesgas, solo ganas ${num(RR, 2)} € cuando aciertas.`}
              </div>
            </div>

            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12.5,
                color: C.ink,
                lineHeight: 1.55,
                marginTop: 14,
                paddingTop: 12,
                borderTop: `1px solid ${C.rule}`,
              }}
            >
              <strong>Lectura:</strong>{" "}
              {positivo
                ? `con ${winRate}% de aciertos y R/R = ${num(RR, 2)}, este sistema gana ${num(E, 2)} € de media por operación. En 100 ops, esperas ${num(E * 100, 0)} €.`
                : `aunque aciertes ${winRate}% de las veces, con R/R = ${num(RR, 2)} pierdes ${num(Math.abs(E), 2)} € de media por operación. La frecuencia de aciertos NO basta; importa el balance G̅/L̅.`}
            </div>
          </div>
        </div>

        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 14,
              marginBottom: 18,
            }}
          >
            <Stat
              label="E por operación"
              value={`${E >= 0 ? "+" : ""}${eur(E)}`}
              color={positivo ? C.green : C.red}
              big
            />
            <Stat
              label={`Tras ${n} ops`}
              value={`${totalEsperado >= 0 ? "+" : ""}${eur(totalEsperado)}`}
              color={positivo ? C.green : C.red}
            />
            <Stat
              label="Ratio R/R"
              value={num(RR, 2)}
              sub={
                RR >= 1
                  ? "Ganas más de lo que pierdes"
                  : "Pierdes más de lo que ganas"
              }
              color={C.gold}
            />
          </div>

          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Curva de capital simulada
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={simulacion}>
              <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
              <XAxis
                dataKey="op"
                tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                stroke={C.rule}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                stroke={C.rule}
                tickFormatter={(v) => `${v >= 0 ? "+" : ""}${v}€`}
              />
              <Tooltip
                contentStyle={{
                  background: C.paper,
                  border: `1px solid ${C.ink}`,
                  fontFamily: fontMono,
                  fontSize: 12,
                  borderRadius: 0,
                }}
                formatter={(v, name) => [
                  eur(v),
                  name === "capital" ? "Real" : "Esperado",
                ]}
                labelFormatter={(l) => `Op. ${l}`}
              />
              <ReferenceLine y={0} stroke={C.ink} strokeWidth={1} />
              <Line
                type="linear"
                dataKey="esperado"
                stroke={C.muted}
                strokeWidth={1}
                strokeDasharray="4 4"
                dot={false}
                name="esperado"
              />
              <Line
                type="linear"
                dataKey="capital"
                stroke={positivo ? C.green : C.red}
                strokeWidth={2}
                dot={false}
                name="capital"
              />
            </LineChart>
          </ResponsiveContainer>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              color: C.muted,
              fontStyle: "italic",
              marginTop: 4,
            }}
          >
            Línea continua = simulación real (con varianza). Línea discontinua
            = camino esperado. Si E es positiva, el sistema converge a la línea
            ascendente <strong>aunque haya rachas malas</strong>.
          </div>
        </div>
      </div>
    </Card>
  );
};

const DrawdownAsimetrico = () => {
  const [dd, setDd] = useState(20);
  const recuperacion = (dd / (100 - dd)) * 100;

  const data = useMemo(() => {
    const arr = [];
    for (let p = 5; p <= 75; p += 5) {
      arr.push({
        perdida: p,
        recuperacion: parseFloat(((p / (100 - p)) * 100).toFixed(1)),
      });
    }
    return arr;
  }, []);

  return (
    <Card accent={C.red}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.3fr",
          gap: 32,
          alignItems: "start",
        }}
      >
        <div>
          <Tag color={C.red}>Asimetría matemática</Tag>
          <h3
            style={{
              fontFamily: fontDisplay,
              fontSize: 24,
              fontWeight: 500,
              margin: "12px 0 8px",
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            Por qué el drawdown duele tanto
          </h3>
          <Body style={{ fontSize: 13, marginBottom: 16 }}>
            <strong>Cómo se usa:</strong> mueve el slider para ver, según la
            caída que hayas tenido, cuánto necesitas subir para volver al
            punto de partida. Es donde más sorpresas se llevan los alumnos.
          </Body>

          <Label value={`${dd}%`}>Caída desde máximo</Label>
          <Slider value={dd} onChange={setDd} min={5} max={75} />

          <div
            style={{
              marginTop: 28,
              padding: 22,
              background: dd >= 30 ? "#FCE9E2" : C.paperDark,
              border: `1px solid ${dd >= 30 ? C.red : C.ink}`,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontFamily: fontMono,
                fontSize: 10,
                letterSpacing: "0.15em",
                color: C.muted,
                marginBottom: 6,
              }}
            >
              Para recuperar necesitas
            </div>
            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 72,
                fontWeight: 700,
                color: dd >= 30 ? C.red : C.ink,
                lineHeight: 1,
                fontStyle: "italic",
                letterSpacing: "-0.04em",
              }}
            >
              +{num(recuperacion, 1)}%
            </div>
            <div
              style={{
                fontFamily: fontBody,
                fontSize: 12,
                color: C.inkSoft,
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              de ganancia sobre el capital restante
            </div>
          </div>

          <div
            style={{
              marginTop: 16,
              padding: "10px 12px",
              background: C.card,
              border: `1px dashed ${C.muted}`,
              fontFamily: fontMono,
              fontSize: 11,
              color: C.inkSoft,
              textAlign: "center",
            }}
          >
            % recuperación = % pérdida / (1 − % pérdida)
          </div>
        </div>

        <div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 8,
            }}
          >
            Curva de asimetría pérdida → recuperación
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.red} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={C.red} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
              <XAxis
                dataKey="perdida"
                tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                stroke={C.rule}
                unit="%"
                label={{
                  value: "Pérdida",
                  position: "insideBottom",
                  offset: -2,
                  style: { fontSize: 10, fontFamily: fontMono, fill: C.muted },
                }}
              />
              <YAxis
                tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                stroke={C.rule}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: C.paper,
                  border: `1px solid ${C.ink}`,
                  fontFamily: fontMono,
                  fontSize: 12,
                  borderRadius: 0,
                }}
                formatter={(v) => [`+${v}%`, "Recuperación"]}
                labelFormatter={(l) => `Pérdida: ${l}%`}
              />
              <Area
                type="monotone"
                dataKey="recuperacion"
                stroke={C.red}
                strokeWidth={2}
                fill="url(#ddGrad)"
              />
              <ReferenceDot
                x={dd}
                y={parseFloat(recuperacion.toFixed(1))}
                r={6}
                fill={C.gold}
                stroke={C.ink}
                strokeWidth={1.5}
              />
            </AreaChart>
          </ResponsiveContainer>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 0,
              marginTop: 16,
              border: `1px solid ${C.ink}`,
            }}
          >
            {[
              { p: 10, r: 11.1, alarm: false },
              { p: 20, r: 25, alarm: false },
              { p: 30, r: 42.9, alarm: true },
              { p: 50, r: 100, alarm: true },
            ].map((x, i) => (
              <div
                key={x.p}
                style={{
                  padding: 14,
                  background: x.alarm ? "#FCE9E2" : C.card,
                  borderRight: i < 3 ? `1px solid ${C.ink}` : "none",
                  textAlign: "center",
                }}
              >
                <div
                  style={{
                    fontFamily: fontMono,
                    fontSize: 10,
                    color: C.muted,
                    marginBottom: 2,
                  }}
                >
                  Pierdes
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 22,
                    color: C.ink,
                    fontWeight: 500,
                  }}
                >
                  −{x.p}%
                </div>
                <div
                  style={{
                    fontFamily: fontMono,
                    fontSize: 14,
                    color: x.alarm ? C.red : C.muted,
                    marginTop: 4,
                  }}
                >
                  necesitas
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 22,
                    color: x.alarm ? C.red : C.green,
                    fontWeight: 500,
                  }}
                >
                  +{x.r}%
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 11,
              color: C.muted,
              fontStyle: "italic",
              marginTop: 6,
              textAlign: "center",
            }}
          >
            Por encima del 20–30% empieza la zona crítica.
          </div>
        </div>
      </div>
    </Card>
  );
};

const MartingalaVsAnti = () => {
  const [winRate, setWinRate] = useState(50);
  const [racha, setRacha] = useState(50);

  const sim = useMemo(() => {
    const ops = 100;
    const baseSize = 100;
    let martingala = { capital: 1000, size: baseSize };
    let antiMartingala = { capital: 1000, size: baseSize };
    const arr = [
      { op: 0, mart: martingala.capital, anti: antiMartingala.capital },
    ];
    let seed = racha;
    const rng = () => {
      seed = (seed * 9301 + 49297) % 233280;
      return seed / 233280;
    };

    for (let i = 1; i <= ops; i++) {
      const win = rng() < winRate / 100;
      if (win) {
        martingala.capital += martingala.size;
        martingala.size = baseSize;
      } else {
        martingala.capital -= martingala.size;
        martingala.size = Math.min(martingala.size * 2, martingala.capital);
        if (martingala.capital <= 0) martingala.capital = 0;
      }
      if (win) {
        antiMartingala.capital += antiMartingala.size;
        antiMartingala.size = Math.min(antiMartingala.size * 1.5, baseSize * 4);
      } else {
        antiMartingala.capital -= antiMartingala.size;
        antiMartingala.size = baseSize;
        if (antiMartingala.capital < 0) antiMartingala.capital = 0;
      }
      arr.push({
        op: i,
        mart: Math.max(martingala.capital, 0),
        anti: Math.max(antiMartingala.capital, 0),
      });
    }
    return arr;
  }, [winRate, racha]);

  const finalMart = sim[sim.length - 1].mart;
  const finalAnti = sim[sim.length - 1].anti;

  return (
    <Card accent={C.gold}>
      <Tag color={C.gold}>Comparador · 100 operaciones</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        Martingala vs. Antimartingala
      </h3>
      <Body style={{ fontSize: 13, marginBottom: 18 }}>
        <strong>Cómo se usa:</strong> ambas estrategias parten con 1.000 €,
        mismo % de aciertos, misma secuencia de operaciones. Solo cambia{" "}
        <strong>la regla de tamaño</strong>. Cambia la semilla para ver
        distintas rachas.
      </Body>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <Label value={`${winRate}%`}>% aciertos</Label>
          <Slider value={winRate} onChange={setWinRate} min={30} max={70} />
        </div>
        <div>
          <Label value={racha}>Semilla (cambia las rachas)</Label>
          <Slider value={racha} onChange={setRacha} min={1} max={100} />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 0,
          marginBottom: 18,
          border: `1px solid ${C.ink}`,
        }}
      >
        <div
          style={{
            padding: 16,
            background: C.card,
            borderRight: `1px solid ${C.ink}`,
            textAlign: "center",
          }}
        >
          <Tag color={C.red}>Martingala</Tag>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 36,
              fontWeight: 500,
              color: finalMart < 1000 ? C.red : C.green,
              marginTop: 8,
            }}
          >
            {eur(finalMart)}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              color: C.muted,
              marginTop: 2,
            }}
          >
            Doblar tras pérdida
          </div>
        </div>
        <div
          style={{
            padding: 16,
            background: C.card,
            textAlign: "center",
          }}
        >
          <Tag color={C.green}>Antimartingala</Tag>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 36,
              fontWeight: 500,
              color: finalAnti < 1000 ? C.red : C.green,
              marginTop: 8,
            }}
          >
            {eur(finalAnti)}
          </div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              color: C.muted,
              marginTop: 2,
            }}
          >
            Aumentar tras ganancia
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={sim}>
          <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
          <XAxis
            dataKey="op"
            tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
            stroke={C.rule}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
            stroke={C.rule}
            tickFormatter={(v) => `${v}€`}
          />
          <Tooltip
            contentStyle={{
              background: C.paper,
              border: `1px solid ${C.ink}`,
              fontFamily: fontMono,
              fontSize: 12,
              borderRadius: 0,
            }}
            formatter={(v) => eur(v)}
            labelFormatter={(l) => `Op. ${l}`}
          />
          <ReferenceLine y={1000} stroke={C.muted} strokeDasharray="4 4" />
          <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
          <Line
            type="linear"
            dataKey="mart"
            name="Martingala"
            stroke={C.red}
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="linear"
            dataKey="anti"
            name="Antimartingala"
            stroke={C.green}
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <div
        style={{
          marginTop: 18,
          padding: 16,
          background: C.paperDark,
          border: `1px dashed ${C.ink}`,
          fontFamily: fontBody,
          fontSize: 13,
          color: C.inkSoft,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: C.ink }}>Lectura:</strong> la martingala suele
        ganar muchas veces poco y perder pocas veces mucho. Una racha
        desfavorable basta para arruinar la cuenta. La antimartingala se{" "}
        <em>capitaliza</em> en las rachas buenas y se protege en las malas.
        Prueba a bajar el win rate al 40% y verás cómo la martingala colapsa.
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  MÓDULO 3 · GESTIÓN DE CARTERAS
// ════════════════════════════════════════════════════════════

const AssetAllocation = () => {
  const [perfil, setPerfil] = useState(1);
  const perfiles = [
    {
      nombre: "Conservador",
      sub: "Preservación · Horizonte corto",
      ret: 4,
      vol: 5,
      ddMax: 8,
      data: [
        { name: "Renta fija", value: 60, c: C.blue },
        { name: "Renta variable", value: 20, c: C.gold },
        { name: "Liquidez", value: 15, c: C.muted },
        { name: "Materias primas", value: 5, c: C.red },
      ],
    },
    {
      nombre: "Moderado",
      sub: "Equilibrio · Horizonte medio",
      ret: 7,
      vol: 10,
      ddMax: 18,
      data: [
        { name: "Renta variable", value: 50, c: C.gold },
        { name: "Renta fija", value: 35, c: C.blue },
        { name: "Materias primas", value: 10, c: C.red },
        { name: "Liquidez", value: 5, c: C.muted },
      ],
    },
    {
      nombre: "Agresivo",
      sub: "Crecimiento · Horizonte largo",
      ret: 10,
      vol: 18,
      ddMax: 35,
      data: [
        { name: "Renta variable", value: 80, c: C.gold },
        { name: "Renta fija", value: 10, c: C.blue },
        { name: "Materias primas", value: 7, c: C.red },
        { name: "Liquidez", value: 3, c: C.muted },
      ],
    },
  ];
  const p = perfiles[perfil];

  return (
    <Card accent={C.green}>
      <Tag color={C.green}>Asset allocation · 3 perfiles</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        La decisión que más explica el resultado
      </h3>
      <Body style={{ fontSize: 13, marginBottom: 20 }}>
        <strong>Cómo se usa:</strong> haz clic en cada perfil para ver cómo
        reparte el dinero entre clases de activo y qué rentabilidad y riesgo
        cabe esperar a largo plazo.
      </Body>

      <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
        {perfiles.map((x, i) => (
          <button
            key={i}
            onClick={() => setPerfil(i)}
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              padding: "10px 16px",
              border: `1px solid ${perfil === i ? C.ink : C.rule}`,
              background: perfil === i ? C.ink : "transparent",
              color: perfil === i ? C.card : C.inkSoft,
              cursor: "pointer",
              borderRadius: 0,
              fontWeight: 500,
              flex: "1 1 140px",
            }}
          >
            {x.nombre}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 24,
          alignItems: "center",
        }}
      >
        <div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie
                data={p.data}
                dataKey="value"
                cx="50%"
                cy="50%"
                outerRadius={100}
                innerRadius={55}
                paddingAngle={2}
                stroke={C.card}
                strokeWidth={2}
              >
                {p.data.map((entry, i) => (
                  <Cell key={i} fill={entry.c} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: C.paper,
                  border: `1px solid ${C.ink}`,
                  fontFamily: fontMono,
                  fontSize: 12,
                  borderRadius: 0,
                }}
                formatter={(v) => [`${v}%`, ""]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 32,
              fontWeight: 500,
              color: C.ink,
              letterSpacing: "-0.02em",
            }}
          >
            Perfil {p.nombre.toLowerCase()}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 13,
              color: C.muted,
              fontStyle: "italic",
              marginBottom: 18,
            }}
          >
            {p.sub}
          </div>

          <div
            style={{
              display: "grid",
              gap: 10,
              fontFamily: fontMono,
              fontSize: 13,
              marginBottom: 20,
            }}
          >
            {p.data.map((d, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "12px 1fr auto",
                  gap: 10,
                  alignItems: "center",
                  paddingBottom: 6,
                  borderBottom: `1px dotted ${C.rule}`,
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    background: d.c,
                  }}
                />
                <span style={{ color: C.inkSoft }}>{d.name}</span>
                <span style={{ color: C.ink, fontWeight: 700 }}>
                  {d.value}%
                </span>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 12,
              borderTop: `1px solid ${C.ink}`,
              paddingTop: 16,
            }}
          >
            <Stat
              label="Ret. esperado"
              value={`${p.ret}%`}
              color={C.green}
            />
            <Stat label="Volatilidad" value={`${p.vol}%`} color={C.gold} />
            <Stat label="DD máx. tol." value={`${p.ddMax}%`} color={C.red} />
          </div>
        </div>
      </div>
    </Card>
  );
};

const BetaSimulator = () => {
  const [beta, setBeta] = useState(1.2);
  const [alpha, setAlpha] = useState(2);

  const data = useMemo(() => {
    const arr = [];
    const benchPath = [0, -3, -6, -2, 1, 4, 7, 9, 6, 3, 5, 8, 12];
    benchPath.forEach((bench, i) => {
      arr.push({
        mes: i,
        bench,
        cartera: parseFloat((beta * bench + alpha * (i / 12)).toFixed(2)),
      });
    });
    return arr;
  }, [beta, alpha]);

  return (
    <Card accent={C.blue}>
      <Tag color={C.blue}>Riesgo relativo · α y β</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        Beta y Alfa: cómo se mueve tu cartera
      </h3>
      <Body style={{ fontSize: 13, marginBottom: 18 }}>
        <strong>Cómo se usa:</strong> ajusta la beta y la alfa de tu cartera y
        compáralas con el benchmark (línea gris). β = multiplicador del
        mercado. α = lo que añades por encima de él.
      </Body>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <div>
          <Label value={num(beta, 2)}>Beta de tu cartera</Label>
          <Slider
            value={beta}
            onChange={setBeta}
            min={-1}
            max={2.5}
            step={0.1}
          />
        </div>
        <div>
          <Label value={`${alpha >= 0 ? "+" : ""}${num(alpha, 1)}%`}>
            Alfa anual
          </Label>
          <Slider value={alpha} onChange={setAlpha} min={-5} max={8} step={0.5} />
        </div>
      </div>

      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data}>
          <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
          <XAxis
            dataKey="mes"
            tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
            stroke={C.rule}
            label={{
              value: "Mes",
              position: "insideBottom",
              offset: -2,
              style: { fontSize: 10, fontFamily: fontMono, fill: C.muted },
            }}
          />
          <YAxis
            tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
            stroke={C.rule}
            unit="%"
          />
          <Tooltip
            contentStyle={{
              background: C.paper,
              border: `1px solid ${C.ink}`,
              fontFamily: fontMono,
              fontSize: 12,
              borderRadius: 0,
            }}
            formatter={(v) => [`${v}%`, ""]}
          />
          <ReferenceLine y={0} stroke={C.ink} strokeWidth={1} />
          <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="bench"
            name="Benchmark (S&P 500)"
            stroke={C.muted}
            strokeWidth={2}
            strokeDasharray="4 4"
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="cartera"
            name="Tu cartera"
            stroke={C.blue}
            strokeWidth={2.5}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          background: C.paperDark,
          border: `1px dashed ${C.ink}`,
          fontFamily: fontMono,
          fontSize: 11,
          color: C.inkSoft,
          lineHeight: 1.6,
        }}
      >
        <strong style={{ color: C.ink }}>Ejemplo:</strong> si β = {num(beta, 2)}{" "}
        y el S&P cae −10%, tu cartera (sin contar α ni divisa) caería{" "}
        <span style={{ color: C.red, fontWeight: 700 }}>
          {num(beta * -10, 1)}%
        </span>
        . Si sube +10%, tu cartera subiría{" "}
        <span style={{ color: C.green, fontWeight: 700 }}>
          {num(beta * 10, 1)}%
        </span>
        .
      </div>
    </Card>
  );
};

const MetricasGlosario = () => {
  const metricas = [
    {
      sigla: "σ",
      nombre: "Volatilidad",
      uso: "Mide cuánto oscila la cartera. Es el riesgo total: arriba o abajo.",
      color: C.blue,
    },
    {
      sigla: "MDD",
      nombre: "Max Drawdown",
      uso: "La peor caída desde el máximo histórico hasta el valle. Es el dolor real.",
      color: C.red,
    },
    {
      sigla: "S",
      nombre: "Ratio de Sharpe",
      uso: "Cuánta rentabilidad extra ganas por cada unidad de riesgo total.",
      color: C.gold,
    },
    {
      sigla: "S↓",
      nombre: "Ratio de Sortino",
      uso: "Como Sharpe, pero solo cuenta la volatilidad a la baja (caídas). Más justo.",
      color: C.green,
    },
    {
      sigla: "C",
      nombre: "Ratio de Calmar",
      uso: "Rentabilidad / drawdown máximo. Útil si tu prioridad es no caer mucho.",
      color: C.red,
    },
    {
      sigla: "β",
      nombre: "Beta",
      uso: "Cuánto amplifica tu cartera al benchmark. β=1 → igual que el mercado.",
      color: C.blue,
    },
    {
      sigla: "α",
      nombre: "Alfa",
      uso: "Lo que tu gestión añade por encima de la beta. Mide habilidad real.",
      color: C.gold,
    },
    {
      sigla: "TE",
      nombre: "Tracking Error",
      uso: "Cuánto se desvía tu cartera del benchmark. Es el riesgo activo que asumes.",
      color: C.muted,
    },
    {
      sigla: "IR",
      nombre: "Information Ratio",
      uso: "Alfa / tracking error. Eficiencia de tu gestión activa.",
      color: C.green,
    },
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: 0,
        border: `1px solid ${C.ink}`,
      }}
    >
      {metricas.map((m, i) => (
        <div
          key={i}
          style={{
            background: C.card,
            padding: 18,
            borderRight: `1px solid ${C.rule}`,
            borderBottom: `1px solid ${C.rule}`,
            minHeight: 130,
          }}
        >
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 38,
              fontWeight: 700,
              color: m.color,
              fontStyle: "italic",
              lineHeight: 1,
              letterSpacing: "-0.02em",
            }}
          >
            {m.sigla}
          </div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 16,
              fontWeight: 500,
              color: C.ink,
              marginTop: 6,
              marginBottom: 6,
            }}
          >
            {m.nombre}
          </div>
          <div
            style={{
              fontFamily: fontBody,
              fontSize: 12,
              lineHeight: 1.5,
              color: C.inkSoft,
            }}
          >
            {m.uso}
          </div>
        </div>
      ))}
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  PUENTE A LA IA
// ════════════════════════════════════════════════════════════

const PuenteIA = () => (
  <div
    style={{
      background: C.ink,
      color: C.paper,
      padding: "48px 36px",
      marginTop: 60,
      position: "relative",
      overflow: "hidden",
    }}
  >
    <div
      style={{
        position: "absolute",
        top: 20,
        right: 28,
        fontFamily: fontMono,
        fontSize: 10,
        letterSpacing: "0.2em",
        color: C.gold,
      }}
    >
      → BLOQUE 5
    </div>
    <Tag color={C.gold}>Próximamente</Tag>
    <h2
      style={{
        fontFamily: fontDisplay,
        fontSize: "clamp(32px, 4.5vw, 48px)",
        fontWeight: 500,
        color: C.paper,
        margin: "16px 0 14px",
        letterSpacing: "-0.025em",
        lineHeight: 1.05,
      }}
    >
      Cuando todo esto se mezcla con{" "}
      <span style={{ fontStyle: "italic", color: C.gold }}>
        Inteligencia Artificial
      </span>
    </h2>
    <p
      style={{
        fontFamily: fontDisplay,
        fontSize: 18,
        lineHeight: 1.5,
        color: "#D9D0BD",
        maxWidth: 780,
        margin: 0,
        fontStyle: "italic",
        fontWeight: 400,
      }}
    >
      La IA no sustituye la gestión monetaria: la potencia. Estima volatilidad
      futura para ajustar el tamaño de posición, detecta cambios de régimen
      para reducir exposición y prioriza señales según condiciones históricas
      similares. Pero el sistema de control —stop, drawdown máximo, tamaño,
      diversificación real— es el mismo. La caja negra no exime de las reglas.
    </p>
    <div
      style={{
        marginTop: 32,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: 0,
        border: `1px solid ${C.gold}`,
      }}
    >
      {[
        { k: "Predicción de volatilidad", v: "→ tamaño adaptativo" },
        { k: "Detección de régimen", v: "→ tendencia vs lateral" },
        { k: "Análisis de sentimiento", v: "→ noticias en tiempo real" },
        { k: "Ejecución algorítmica", v: "→ menor deslizamiento" },
      ].map((x, i, a) => (
        <div
          key={i}
          style={{
            padding: 18,
            borderRight: i < a.length - 1 ? `1px solid ${C.gold}` : "none",
          }}
        >
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              color: C.gold,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginBottom: 6,
            }}
          >
            {x.k}
          </div>
          <div
            style={{
              fontFamily: fontDisplay,
              fontSize: 15,
              color: C.paper,
              fontStyle: "italic",
            }}
          >
            {x.v}
          </div>
        </div>
      ))}
    </div>
  </div>
);

// ════════════════════════════════════════════════════════════
//  ÍNDICE NAVEGABLE
// ════════════════════════════════════════════════════════════

const TOC = [
  {
    n: "01",
    titulo: "Diversificación",
    anchor: "seccion-diversificacion",
    sub: [
      { n: "1.1", titulo: "Niveles de diversificación", anchor: "sub-niveles" },
      { n: "1.2", titulo: "El motor matemático: la correlación", anchor: "sub-correlacion" },
      { n: "1.3", titulo: "Tres casos reales que enseñan", anchor: "sub-casos" },
      { n: "1.4", titulo: "Más allá del sector: factores", anchor: "sub-factores" },
      { n: "1.5", titulo: "Plantillas de cartera", anchor: "sub-plantillas" },
    ],
  },
  {
    n: "02",
    titulo: "Gestión Monetaria",
    anchor: "seccion-gestion-monetaria",
    sub: [
      { n: "2.1", titulo: "Cuántas acciones puedo comprar", anchor: "sub-tamano" },
      { n: "2.2", titulo: "Esperanza matemática", anchor: "sub-esperanza" },
      { n: "2.3", titulo: "Drawdown · la asimetría que mata cuentas", anchor: "sub-drawdown" },
      { n: "2.4", titulo: "Martingala vs Antimartingala", anchor: "sub-martingala" },
    ],
  },
  {
    n: "03",
    titulo: "Gestión de Carteras",
    anchor: "seccion-carteras",
    sub: [
      { n: "3.1", titulo: "Asset Allocation", anchor: "sub-allocation" },
      { n: "3.2", titulo: "Cómo asignar los pesos", anchor: "sub-pesos" },
      { n: "3.3", titulo: "Riesgo relativo · Beta y Alfa", anchor: "sub-beta" },
      { n: "3.4", titulo: "Rebalanceo", anchor: "sub-rebalanceo" },
      { n: "3.5", titulo: "Métricas clave", anchor: "sub-metricas" },
      { n: "3.6", titulo: "Plan de eventos extremos", anchor: "sub-eventos" },
      { n: "3.7", titulo: "Los 7 riesgos ocultos", anchor: "sub-riesgos" },
    ],
  },
  {
    n: "04",
    titulo: "Principios irrenunciables",
    anchor: "seccion-principios",
  },
  {
    n: "05",
    titulo: "Evaluación final · 60 preguntas",
    anchor: "seccion-evaluacion",
  },
];

const scrollToAnchor = (id) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const IndiceNavegacion = () => (
  <section
    id="indice"
    style={{
      margin: "0 0 56px",
      padding: "32px 0",
      borderTop: `1px solid ${C.rule}`,
      borderBottom: `1px solid ${C.rule}`,
    }}
  >
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 22 }}>
      <Tag color={C.gold} filled>Índice</Tag>
      <span
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          letterSpacing: "0.15em",
          color: C.muted,
          textTransform: "uppercase",
        }}
      >
        Navega entre secciones
      </span>
    </div>

    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
        gap: 28,
      }}
    >
      {TOC.map((sec) => (
        <div key={sec.anchor}>
          <button
            onClick={() => scrollToAnchor(sec.anchor)}
            onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
            onMouseLeave={(e) => (e.currentTarget.style.color = C.ink)}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 12,
              padding: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontFamily: fontDisplay,
              fontSize: 22,
              fontWeight: 500,
              color: C.ink,
              letterSpacing: "-0.015em",
              marginBottom: 10,
              textAlign: "left",
              transition: "color 0.15s",
            }}
          >
            <span
              style={{
                fontFamily: fontDisplay,
                fontSize: 28,
                fontWeight: 900,
                fontStyle: "italic",
                color: C.gold,
                lineHeight: 1,
              }}
            >
              {sec.n}
            </span>
            {sec.titulo}
          </button>

          {sec.sub && (
            <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 36px" }}>
              {sec.sub.map((s) => (
                <li key={s.anchor} style={{ marginBottom: 4 }}>
                  <button
                    onClick={() => scrollToAnchor(s.anchor)}
                    onMouseEnter={(e) => (e.currentTarget.style.color = C.gold)}
                    onMouseLeave={(e) => (e.currentTarget.style.color = C.inkSoft)}
                    style={{
                      padding: 0,
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontFamily: fontMono,
                      fontSize: 12,
                      color: C.inkSoft,
                      textAlign: "left",
                      transition: "color 0.15s",
                    }}
                  >
                    <span style={{ color: C.muted, marginRight: 8 }}>{s.n}</span>
                    {s.titulo}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  </section>
);

// Botón flotante "Volver al índice grande"
const BotonVolverIndice = () => {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 800);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;
  return (
    <button
      onClick={() => scrollToAnchor("indice")}
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 40,
        padding: "10px 16px",
        background: C.ink,
        color: C.card,
        border: `1px solid ${C.gold}`,
        borderRadius: 999,
        fontFamily: fontMono,
        fontSize: 11,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        cursor: "pointer",
        boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
        fontWeight: 600,
      }}
    >
      ↑ Índice completo
    </button>
  );
};

// Barra de navegación compacta fija en la parte superior, visible al hacer scroll.
const IndiceStickyCompacto = () => {
  const [visible, setVisible] = useState(false);
  const [activa, setActiva] = useState("seccion-diversificacion");

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > 600);
      // Detecta qué sección está actualmente en viewport
      const offsets = TOC.map((sec) => {
        const el = document.getElementById(sec.anchor);
        if (!el) return { anchor: sec.anchor, top: Infinity };
        return { anchor: sec.anchor, top: el.getBoundingClientRect().top };
      });
      // La sección activa es la última cuyo top <= 120px
      const current = offsets
        .filter((o) => o.top <= 120)
        .sort((a, b) => b.top - a.top)[0];
      if (current) setActiva(current.anchor);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;
  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 40,
        background: "rgba(244, 239, 230, 0.93)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderBottom: `1px solid ${C.rule}`,
        padding: "10px 20px",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: fontMono,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.muted,
            marginRight: 8,
          }}
        >
          Índice ·
        </span>
        {TOC.map((sec) => {
          const esActiva = sec.anchor === activa;
          return (
            <button
              key={sec.anchor}
              onClick={() => scrollToAnchor(sec.anchor)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 12px",
                border: `1px solid ${esActiva ? C.ink : C.rule}`,
                background: esActiva ? C.ink : "transparent",
                cursor: "pointer",
                fontFamily: fontDisplay,
                fontSize: 13,
                color: esActiva ? C.card : C.ink,
                fontWeight: 500,
                borderRadius: 999,
                transition: "all 0.15s",
              }}
            >
              <span
                style={{
                  fontFamily: fontMono,
                  fontSize: 10,
                  color: esActiva ? C.gold : C.gold,
                  fontWeight: 700,
                }}
              >
                {sec.n}
              </span>
              {sec.titulo}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ════════════════════════════════════════════════════════════
//  DIVERSIFICACIÓN POR FACTORES
// ════════════════════════════════════════════════════════════

const FACTORES = [
  {
    n: "01",
    nombre: "Crecimiento (Growth)",
    def: "Empresas con altas tasas de crecimiento esperado. P/E altos, poco dividendo.",
    ejemplos: "NVDA, TSLA, NFLX, ARKK, ETFs Nasdaq",
    sufre: "Cuando suben los tipos de interés (sus beneficios futuros valen menos hoy)",
    color: C.red,
  },
  {
    n: "02",
    nombre: "Valor (Value)",
    def: "Empresas baratas según métricas fundamentales (P/E bajo, alto dividendo).",
    ejemplos: "BRK-B, JPM, XOM, sectores tradicionales",
    sufre: "En entornos growth o cuando 'lo barato sigue barato' por motivos estructurales",
    color: C.blue,
  },
  {
    n: "03",
    nombre: "Tamaño (Size)",
    def: "Pequeñas (small caps) frente a grandes. Históricamente las pequeñas rinden más a largo plazo, con más volatilidad.",
    ejemplos: "Russell 2000 (small) vs S&P 500 (large)",
    sufre: "En crisis de liquidez (los pequeños no pueden venderse fácilmente)",
    color: C.gold,
  },
  {
    n: "04",
    nombre: "Calidad (Quality)",
    def: "Balances sólidos, alta rentabilidad sostenida y baja deuda.",
    ejemplos: "MSFT, JNJ, KO, PG",
    sufre: "En rallies muy especulativos donde se prefiere riesgo sobre solidez",
    color: C.green,
  },
  {
    n: "05",
    nombre: "Momentum",
    def: "Activos que más han subido en los últimos 6-12 meses. Apuesta a que las tendencias continúan.",
    ejemplos: "Tickers en máximos de 52 semanas",
    sufre: "En reversiones bruscas (factor con mayores drawdowns)",
    color: C.red,
  },
  {
    n: "06",
    nombre: "Duración (en bonos)",
    def: "Sensibilidad de un bono a cambios en los tipos. Bonos largos = alta duración.",
    ejemplos: "TLT (USA 20+ años) vs BIL (T-bills 1-3 meses)",
    sufre: "Cuando suben los tipos de interés (precio del bono baja)",
    color: C.blue,
  },
  {
    n: "07",
    nombre: "Sensibilidad a tipos",
    def: "Aplica también a acciones: tech/growth + REITs + utilities tienden a sufrir cuando suben los tipos.",
    ejemplos: "Tech (NVDA) + REITs (PLD, AMT) + Utilities (NEE, DUK)",
    sufre: "Subidas rápidas de tipos como en 2022",
    color: C.gold,
  },
];

const DiversificacionFactores = () => (
  <Card accent={C.blue}>
    <Tag color={C.blue}>Más allá del sector</Tag>
    <h3
      style={{
        fontFamily: fontDisplay,
        fontSize: 24,
        fontWeight: 500,
        margin: "12px 0 14px",
        color: C.ink,
        letterSpacing: "-0.02em",
      }}
    >
      Los 7 factores que mueven los activos
    </h3>
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
        marginBottom: 18,
      }}
    >
      {FACTORES.map((f) => (
        <div
          key={f.n}
          style={{
            border: `1px solid ${C.rule}`,
            borderTop: `3px solid ${f.color}`,
            padding: 14,
            background: C.card,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontFamily: fontDisplay,
                fontSize: 26,
                fontWeight: 900,
                fontStyle: "italic",
                color: f.color,
                lineHeight: 1,
              }}
            >
              {f.n}
            </span>
            <span
              style={{
                fontFamily: fontDisplay,
                fontSize: 16,
                fontWeight: 500,
                color: C.ink,
                letterSpacing: "-0.01em",
              }}
            >
              {f.nombre}
            </span>
          </div>
          <div style={{ fontFamily: fontBody, fontSize: 12.5, lineHeight: 1.5, color: C.inkSoft, marginBottom: 8 }}>
            {f.def}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: 10.5, color: C.muted, marginBottom: 4, letterSpacing: "0.05em" }}>
            EJEMPLOS · {f.ejemplos}
          </div>
          <div style={{ fontFamily: fontMono, fontSize: 10.5, color: f.color, fontStyle: "italic" }}>
            ↳ Sufre {f.sufre.toLowerCase()}
          </div>
        </div>
      ))}
    </div>
    <div
      style={{
        background: C.paperDark,
        borderLeft: `4px solid ${C.red}`,
        padding: "14px 16px",
        fontFamily: fontDisplay,
        fontSize: 14,
        lineHeight: 1.55,
        color: C.ink,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 6,
        }}
      >
        Caso real · 2022
      </div>
      Una cartera con NVDA (tech) + PLD (REIT) + NEE (utility) parece muy diversificada por sectores. Pero los tres comparten alta <strong>sensibilidad a tipos</strong>. En 2022, cuando la Fed subió los tipos del 0% al 5%, los tres cayeron entre 30% y 45%. La diversificación sectorial NO funcionó porque el factor era el mismo.
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════
//  SIMULADOR DE PESOS — capital vs riesgo
// ════════════════════════════════════════════════════════════

const ACTIVOS_PESOS = [
  { ticker: "SPY", nombre: "S&P 500", sigma: 16 },
  { ticker: "GLD", nombre: "Oro", sigma: 14 },
  { ticker: "NVDA", nombre: "Nvidia", sigma: 45 },
];

const calcularPesos = (metodo, sigmas) => {
  switch (metodo) {
    case "iguales":
      return [1 / 3, 1 / 3, 1 / 3];
    case "marketcap":
      return [0.8, 0.15, 0.05];
    case "porriesgo": {
      const inv = sigmas.map((s) => 1 / s);
      const sum = inv.reduce((a, b) => a + b, 0);
      return inv.map((i) => i / sum);
    }
    case "volobjetivo":
      return [0.5, 0.45, 0.05];
    default:
      return [1 / 3, 1 / 3, 1 / 3];
  }
};

const calcularVolCartera = (pesos, sigmas, rho = 0.3) => {
  let varP = 0;
  for (let i = 0; i < pesos.length; i++) {
    for (let j = 0; j < pesos.length; j++) {
      const corr = i === j ? 1 : rho;
      varP += pesos[i] * pesos[j] * (sigmas[i] / 100) * (sigmas[j] / 100) * corr;
    }
  }
  return Math.sqrt(Math.max(varP, 0)) * 100;
};

const calcularContribucionRiesgo = (pesos, sigmas) => {
  const contrib = pesos.map((w, i) => w * sigmas[i]);
  const sum = contrib.reduce((a, b) => a + b, 0);
  return contrib.map((c) => c / sum);
};

const METODOS_PESOS = [
  { id: "iguales", label: "Pesos iguales" },
  { id: "marketcap", label: "Por capitalización" },
  { id: "porriesgo", label: "Por riesgo (1/σ)" },
  { id: "volobjetivo", label: "Por vol. objetivo" },
];

const MENSAJES_PESOS = {
  iguales:
    "Sencillo, pero NVDA representa una porción enorme del riesgo total aunque solo aporte 33% del capital.",
  marketcap:
    "Refleja el mercado pero concentras en SPY. Estás casi 'comprando el índice'.",
  porriesgo:
    "Cada activo aporta aproximadamente lo mismo al riesgo total. NVDA pesa poco en capital pero mucho en σ.",
  volobjetivo:
    "Pesos calculados para que la cartera tenga σ ≈ 12%. NVDA acaba pesando muy poco porque su volatilidad es desproporcionada.",
};

const SimuladorPesos = () => {
  const [metodo, setMetodo] = useState("iguales");
  const sigmas = ACTIVOS_PESOS.map((a) => a.sigma);
  const pesos = useMemo(() => calcularPesos(metodo, sigmas), [metodo]);
  const volCartera = calcularVolCartera(pesos, sigmas, 0.3);
  const contribuciones = calcularContribucionRiesgo(pesos, sigmas);

  const dataCapital = ACTIVOS_PESOS.map((a, i) => ({
    name: a.ticker,
    value: parseFloat((pesos[i] * 100).toFixed(1)),
  }));
  const dataRiesgo = ACTIVOS_PESOS.map((a, i) => ({
    name: a.ticker,
    value: parseFloat((contribuciones[i] * 100).toFixed(1)),
  }));

  const COLORS_PESOS = [C.blue, C.gold, C.red];

  return (
    <Card accent={C.blue}>
      <Tag color={C.blue}>Capital vs riesgo</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 18px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        ¿Pesos iguales en capital significa riesgo igual?
      </h3>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        {METODOS_PESOS.map((m) => (
          <button
            key={m.id}
            onClick={() => setMetodo(m.id)}
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "10px 14px",
              border: `1px solid ${metodo === m.id ? C.ink : C.rule}`,
              background: metodo === m.id ? C.ink : "transparent",
              color: metodo === m.id ? C.card : C.inkSoft,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <Stat label="Vol. cartera" value={`${num(volCartera, 1)}%`} color={C.blue} big />
        <Stat
          label="Activos"
          value={ACTIVOS_PESOS.map((a) => a.ticker).join(" · ")}
          sub="σ: 16% · 14% · 45%"
          color={C.muted}
        />
        <Stat label="ρ asumida" value="0,30" sub="entre los 3 activos" color={C.muted} />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 22,
          marginBottom: 18,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Peso en CAPITAL
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={dataCapital} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {dataCapital.map((_, i) => (
                  <Cell key={i} fill={COLORS_PESOS[i]} stroke={C.ink} strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Peso en RIESGO
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={dataRiesgo} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {dataRiesgo.map((_, i) => (
                  <Cell key={i} fill={COLORS_PESOS[i]} stroke={C.ink} strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip formatter={(v) => `${v}%`} />
              <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          background: C.paperDark,
          borderLeft: `3px solid ${C.blue}`,
          fontFamily: fontDisplay,
          fontSize: 14,
          lineHeight: 1.55,
          color: C.ink,
        }}
      >
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 9,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 6,
          }}
        >
          Lectura
        </div>
        {MENSAJES_PESOS[metodo]}
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  SIMULADOR DE REBALANCEO
// ════════════════════════════════════════════════════════════

const simularCartera = (meses, retRV, retRF, modo) => {
  let RV = 6000;
  let RF = 4000;
  let rebalanceos = 0;
  const historico = [];
  const tasaMensualRV = Math.pow(1 + retRV / 100, 1 / 12) - 1;
  const tasaMensualRF = Math.pow(1 + retRF / 100, 1 / 12) - 1;

  for (let m = 0; m <= meses; m++) {
    if (m > 0) {
      RV *= 1 + tasaMensualRV;
      RF *= 1 + tasaMensualRF;
    }
    const total = RV + RF;
    const pesoRV = RV / total;

    let rebalancearAhora = false;
    if (modo === "anual" && m > 0 && m % 12 === 0) {
      rebalancearAhora = true;
    } else if (modo === "umbral" && Math.abs(pesoRV - 0.6) > 0.05) {
      rebalancearAhora = true;
    }

    if (rebalancearAhora) {
      RV = total * 0.6;
      RF = total * 0.4;
      rebalanceos++;
    }

    historico.push({
      mes: m,
      pesoRV: parseFloat(((RV / (RV + RF)) * 100).toFixed(2)),
      total: parseFloat((RV + RF).toFixed(0)),
    });
  }
  return { RV, RF, rebalanceos, historico };
};

const SimuladorRebalanceo = () => {
  const [meses, setMeses] = useState(36);
  const [retRV, setRetRV] = useState(12);
  const [retRF, setRetRF] = useState(3);
  const [modo, setModo] = useState("sin");

  const sim = useMemo(
    () => simularCartera(meses, retRV, retRF, modo),
    [meses, retRV, retRF, modo]
  );
  const total = sim.RV + sim.RF;
  const pesoRV = (sim.RV / total) * 100;
  const desviacion = pesoRV - 60;

  // Curvas comparativas (los 3 modos a la vez)
  const curvaSin = useMemo(() => simularCartera(meses, retRV, retRF, "sin").historico, [meses, retRV, retRF]);
  const curvaAnual = useMemo(() => simularCartera(meses, retRV, retRF, "anual").historico, [meses, retRV, retRF]);
  const curvaUmbral = useMemo(() => simularCartera(meses, retRV, retRF, "umbral").historico, [meses, retRV, retRF]);

  const dataCombinada = useMemo(() => {
    return curvaSin.map((p, i) => ({
      mes: p.mes,
      sin: p.pesoRV,
      anual: curvaAnual[i]?.pesoRV ?? null,
      umbral: curvaUmbral[i]?.pesoRV ?? null,
    }));
  }, [curvaSin, curvaAnual, curvaUmbral]);

  const dataDonut = [
    { name: "RV", value: parseFloat(pesoRV.toFixed(1)) },
    { name: "RF", value: parseFloat((100 - pesoRV).toFixed(1)) },
  ];
  const colorPeso =
    Math.abs(desviacion) < 5 ? C.green : Math.abs(desviacion) < 10 ? C.gold : C.red;

  const MODOS = [
    { id: "sin", label: "Sin rebalancear" },
    { id: "anual", label: "Rebalanceo anual" },
    { id: "umbral", label: "Umbral 5pp" },
  ];

  return (
    <Card accent={C.gold}>
      <Tag color={C.gold}>Mantener la cartera en el carril</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        Cartera 60/40 a lo largo del tiempo
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: C.inkSoft,
          lineHeight: 1.55,
          marginBottom: 18,
        }}
      >
        <strong>Cómo se usa:</strong> partes de 10.000 € repartidos 60/40 (6.000 RV + 4.000 RF).
        Mueve el tiempo y las rentabilidades. Compara los 3 modos: sin rebalancear, anual y por umbral.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 28 }}>
        <div>
          <Label value={`${meses} meses`} hint="Tiempo transcurrido">Tiempo</Label>
          <Slider value={meses} onChange={setMeses} min={0} max={60} />

          <Label value={`${retRV}% / año`} hint="Rentabilidad media RV">Rentabilidad RV</Label>
          <Slider value={retRV} onChange={setRetRV} min={-10} max={20} />

          <Label value={`${retRF}% / año`} hint="Rentabilidad media RF">Rentabilidad RF</Label>
          <Slider value={retRF} onChange={setRetRF} min={-5} max={8} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
            {MODOS.map((m) => (
              <button
                key={m.id}
                onClick={() => setModo(m.id)}
                style={{
                  fontFamily: fontMono,
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "8px 12px",
                  border: `1px solid ${modo === m.id ? C.ink : C.rule}`,
                  background: modo === m.id ? C.ink : "transparent",
                  color: modo === m.id ? C.card : C.inkSoft,
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              padding: "16px 0",
              borderTop: `1px solid ${C.rule}`,
              borderBottom: `1px solid ${C.rule}`,
              marginBottom: 14,
            }}
          >
            <Stat label="Peso RV actual" value={`${num(pesoRV, 1)}%`} color={colorPeso} big />
            <Stat
              label="Desviación"
              value={`${desviacion >= 0 ? "+" : ""}${num(desviacion, 1)} pp`}
              sub="vs objetivo 60%"
              color={colorPeso}
            />
            <Stat label="Rebalanceos" value={`${sim.rebalanceos}`} sub="ejecutados" color={C.muted} />
            <Stat label="Total cartera" value={`${num(total, 0)} €`} color={C.ink} />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "120px 1fr",
              gap: 14,
              alignItems: "center",
              marginBottom: 14,
            }}
          >
            <ResponsiveContainer width="100%" height={120}>
              <PieChart>
                <Pie data={dataDonut} dataKey="value" innerRadius={28} outerRadius={50} paddingAngle={2}>
                  <Cell fill={C.blue} stroke={C.ink} strokeWidth={1} />
                  <Cell fill={C.gold} stroke={C.ink} strokeWidth={1} />
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ fontFamily: fontMono, fontSize: 11, color: C.inkSoft, lineHeight: 1.6 }}>
              <div><span style={{ color: C.blue, fontWeight: 700 }}>RV</span> · {num(sim.RV, 0)} €</div>
              <div><span style={{ color: C.gold, fontWeight: 700 }}>RF</span> · {num(sim.RF, 0)} €</div>
            </div>
          </div>

          <div
            style={{
              fontFamily: fontMono,
              fontSize: 10,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: C.muted,
              marginBottom: 6,
            }}
          >
            Peso RV en el tiempo · 3 modos comparados
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={dataCombinada}>
              <CartesianGrid stroke={C.rule} strokeDasharray="2 4" />
              <XAxis dataKey="mes" tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }} stroke={C.rule} />
              <YAxis
                tick={{ fontSize: 10, fontFamily: fontMono, fill: C.muted }}
                stroke={C.rule}
                domain={[40, 90]}
                unit="%"
              />
              <Tooltip
                contentStyle={{
                  background: C.paper,
                  border: `1px solid ${C.ink}`,
                  fontFamily: fontMono,
                  fontSize: 11,
                  borderRadius: 0,
                }}
                formatter={(v) => [`${v}%`, ""]}
              />
              <Legend wrapperStyle={{ fontFamily: fontMono, fontSize: 11 }} />
              <ReferenceLine y={60} stroke={C.green} strokeDasharray="4 4" />
              <ReferenceLine y={55} stroke={C.gold} strokeDasharray="2 4" />
              <ReferenceLine y={65} stroke={C.gold} strokeDasharray="2 4" />
              <Line type="monotone" dataKey="sin" stroke={C.red} strokeWidth={2} dot={false} name="Sin rebalancear" />
              <Line type="monotone" dataKey="anual" stroke={C.blue} strokeWidth={2} dot={false} name="Anual" />
              <Line type="monotone" dataKey="umbral" stroke={C.gold} strokeWidth={2} dot={false} name="Umbral 5pp" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  PLAN DE EVENTOS EXTREMOS
// ════════════════════════════════════════════════════════════

const ESCENARIOS_EVENTOS = [
  {
    id: "1",
    titulo: "Drawdown del 15% desde mi máximo",
    contexto: "Racha de pérdidas o corrección de mercado",
    placeholder: "Ej: reducir tamaño de posición a la mitad, no abrir nuevas, revisar últimas 10 ops...",
  },
  {
    id: "2",
    titulo: "Volatilidad se duplica vs mes anterior",
    contexto: "Crisis política, eventos macro",
    placeholder: "Ej: cerrar posiciones más volátiles, aumentar liquidez al 20%...",
  },
  {
    id: "3",
    titulo: "Correlaciones convergen a 0,9+",
    contexto: "Evento de pánico, 'todo cae junto'",
    placeholder: "Ej: cerrar posiciones del mismo factor, mantener solo las de menor correlación...",
  },
  {
    id: "4",
    titulo: "Una posición pesa ya >25% del total",
    contexto: "Una acción que ha multiplicado mucho",
    placeholder: "Ej: vender la mitad, fijar trailing stop, no añadir más...",
  },
  {
    id: "5",
    titulo: "Pierdo 5% en una sola sesión",
    contexto: "Gap, noticia inesperada",
    placeholder: "Ej: parar 24h, no vender por pánico, revisar si la tesis sigue válida...",
  },
];

const PlanEventoFila = ({ escenario }) => {
  const [resp, setResp] = useStoredValue(`plan-evento:${escenario.id}`, "");
  const tieneRespuesta = resp.trim().length > 0;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${tieneRespuesta ? C.green : C.rule}`,
        borderLeft: `4px solid ${tieneRespuesta ? C.green : C.red}`,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 4,
        }}
      >
        Escenario {escenario.id} · {escenario.contexto}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 17,
          fontWeight: 500,
          color: C.ink,
          letterSpacing: "-0.01em",
          marginBottom: 10,
        }}
      >
        {escenario.titulo}
      </div>
      <textarea
        value={resp}
        onChange={(e) => setResp(e.target.value)}
        placeholder={escenario.placeholder}
        rows={3}
        style={{
          width: "100%",
          fontFamily: fontBody,
          fontSize: 14,
          lineHeight: 1.5,
          color: C.ink,
          background: C.paper,
          border: `1px solid ${C.rule}`,
          padding: 10,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

const PlanEventosExtremos = () => (
  <Card accent={C.red}>
    <Tag color={C.red}>Plan de actuación predefinido</Tag>
    <h3
      style={{
        fontFamily: fontDisplay,
        fontSize: 24,
        fontWeight: 500,
        margin: "12px 0 18px",
        color: C.ink,
        letterSpacing: "-0.02em",
      }}
    >
      ¿Qué harás cuando lleguen los problemas?
    </h3>
    <div>
      {ESCENARIOS_EVENTOS.map((e) => (
        <PlanEventoFila key={e.id} escenario={e} />
      ))}
    </div>
  </Card>
);

// ════════════════════════════════════════════════════════════
//  LOS 7 RIESGOS OCULTOS
// ════════════════════════════════════════════════════════════

const RIESGOS = [
  {
    n: "01",
    nombre: "Concentración",
    def: "Demasiado peso en un activo, sector o país.",
    ejemplo: "Tener 60% de la cartera en una sola acción aunque sea Apple.",
    color: C.red,
  },
  {
    n: "02",
    nombre: "Correlación",
    def: "Activos distintos que se comportan igual en momentos críticos.",
    ejemplo: "Iberdrola + Endesa + Naturgy: 3 tickers, 1 sola fuente de riesgo (eléctricas españolas).",
    color: C.gold,
  },
  {
    n: "03",
    nombre: "Volatilidad",
    def: "Oscilaciones que fuerzan decisiones emocionales o incumplimiento de reglas.",
    ejemplo: "Tu cartera baja un 15% en una semana y vendes en pánico, aunque tu plan dijera aguantar.",
    color: C.blue,
  },
  {
    n: "04",
    nombre: "Drawdown",
    def: "Caídas acumuladas que exigen recuperaciones matemáticamente difíciles.",
    ejemplo: "Perder 50% requiere ganar 100% para recuperarte.",
    color: C.red,
  },
  {
    n: "05",
    nombre: "Liquidez",
    def: "No poder salir sin impacto, sin coste alto o sin sufrir deslizamiento.",
    ejemplo: "Small cap que cotiza muy poco; vender 1.000 acciones mueve el precio un 3%.",
    color: C.gold,
  },
  {
    n: "06",
    nombre: "Divisa",
    def: "En carteras internacionales, parte del resultado viene del tipo de cambio.",
    ejemplo: "S&P 500 sube 10% en USD pero el dólar cae 12% frente al euro → pierdes en euros.",
    color: C.blue,
  },
  {
    n: "07",
    nombre: "Cola (tail risk)",
    def: "Eventos raros pero severos: crisis de liquidez, gaps, correlaciones que tienden a 1.",
    ejemplo: "Marzo 2020. Todo cae junto, los stops no saltan al precio que esperabas.",
    color: C.red,
  },
];

const RiesgosOcultos = () => {
  const [marcados, setMarcados] = useState(() => {
    try {
      const out = {};
      RIESGOS.forEach((r) => {
        const v = localStorage.getItem(`leccion3:riesgo-expuesto:${r.n}`);
        out[r.n] = v ? JSON.parse(v) : false;
      });
      return out;
    } catch {
      return {};
    }
  });

  const toggle = (n) => {
    const next = !marcados[n];
    const updated = { ...marcados, [n]: next };
    setMarcados(updated);
    try {
      localStorage.setItem(`leccion3:riesgo-expuesto:${n}`, JSON.stringify(next));
      lessonBus.notify();
    } catch { /* */ }
  };

  const total = Object.values(marcados).filter(Boolean).length;

  let mensaje;
  let mensajeColor;
  if (total <= 1) {
    mensaje =
      "¿Seguro? Revisa tu cartera otra vez. Casi todas las carteras tienen al menos 2-3 riesgos significativos.";
    mensajeColor = C.gold;
  } else if (total <= 3) {
    mensaje = "Diagnóstico realista. Tienes identificados los principales riesgos.";
    mensajeColor = C.blue;
  } else if (total <= 5) {
    mensaje = "Hay trabajo que hacer. Prioriza los de mayor impacto.";
    mensajeColor = C.gold;
  } else {
    mensaje =
      "Reconocimiento honesto. Ahora diseña un plan para reducir cada uno.";
    mensajeColor = C.green;
  }

  return (
    <Card accent={C.red}>
      <Tag color={C.red}>Auditoría · marca los que te aplican</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 18px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        Los 7 riesgos ocultos de cualquier cartera
      </h3>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
          gap: 16,
        }}
      >
        {RIESGOS.map((r) => (
          <div
            key={r.n}
            style={{
              border: `1px solid ${marcados[r.n] ? r.color : C.rule}`,
              borderTop: `3px solid ${r.color}`,
              padding: 16,
              background: marcados[r.n] ? C.paperDark : C.card,
              transition: "background 0.15s, border-color 0.15s",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
              <span
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 30,
                  fontWeight: 900,
                  fontStyle: "italic",
                  color: r.color,
                  lineHeight: 1,
                }}
              >
                {r.n}
              </span>
              <span
                style={{
                  fontFamily: fontDisplay,
                  fontSize: 18,
                  fontWeight: 500,
                  color: C.ink,
                  letterSpacing: "-0.015em",
                }}
              >
                {r.nombre}
              </span>
            </div>

            <div
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                color: C.inkSoft,
                lineHeight: 1.5,
                marginBottom: 10,
              }}
            >
              {r.def}
            </div>

            <div
              style={{
                fontFamily: fontDisplay,
                fontSize: 12,
                color: C.ink,
                fontStyle: "italic",
                lineHeight: 1.45,
                padding: 10,
                border: `1px dashed ${r.color}`,
                marginBottom: 12,
              }}
            >
              {r.ejemplo}
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                cursor: "pointer",
                fontFamily: fontMono,
                fontSize: 11,
                letterSpacing: "0.05em",
                color: marcados[r.n] ? r.color : C.muted,
                fontWeight: marcados[r.n] ? 700 : 500,
              }}
            >
              <input
                type="checkbox"
                checked={!!marcados[r.n]}
                onChange={() => toggle(r.n)}
                style={{ width: 16, height: 16, cursor: "pointer", accentColor: r.color }}
              />
              {marcados[r.n] ? "✓ ESTOY EXPUESTO" : "¿Estoy expuesto?"}
            </label>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 22,
          padding: "16px 18px",
          background: C.paperDark,
          borderLeft: `4px solid ${mensajeColor}`,
          fontFamily: fontDisplay,
          fontSize: 15,
          lineHeight: 1.55,
          color: C.ink,
        }}
      >
        <div
          style={{
            fontFamily: fontMono,
            fontSize: 10,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: C.muted,
            marginBottom: 6,
          }}
        >
          Diagnóstico · {total} de 7 riesgos marcados
        </div>
        {mensaje}
      </div>
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  EVALUACIÓN FINAL · 60 preguntas
// ════════════════════════════════════════════════════════════

const PreguntaAbierta = ({ id, pregunta }) => {
  const [resp, setResp] = useStoredValue(`abierta:${id}`, "");
  const tieneRespuesta = resp.trim().length > 0;
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${tieneRespuesta ? C.green : C.rule}`,
        borderLeft: `3px solid ${tieneRespuesta ? C.green : C.blue}`,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          fontFamily: fontMono,
          fontSize: 10,
          letterSpacing: "0.15em",
          textTransform: "uppercase",
          color: C.muted,
          marginBottom: 6,
        }}
      >
        Pregunta abierta · {id}
      </div>
      <div
        style={{
          fontFamily: fontDisplay,
          fontSize: 16,
          fontWeight: 500,
          color: C.ink,
          letterSpacing: "-0.01em",
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {pregunta}
      </div>
      <textarea
        value={resp}
        onChange={(e) => setResp(e.target.value)}
        placeholder="Tu respuesta..."
        rows={3}
        style={{
          width: "100%",
          fontFamily: fontBody,
          fontSize: 14,
          lineHeight: 1.5,
          color: C.ink,
          background: C.paper,
          border: `1px solid ${C.rule}`,
          padding: 10,
          resize: "vertical",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
};

const BLOQUES_EVALUACION = [
  {
    id: "div",
    label: "Diversificación",
    color: C.gold,
    test: TEST_DIVERSIFICACION,
    abiertas: ABIERTAS_DIVERSIFICACION,
  },
  {
    id: "gm",
    label: "Gestión Monetaria",
    color: C.red,
    test: TEST_GESTIONMON,
    abiertas: ABIERTAS_GESTIONMON,
  },
  {
    id: "cart",
    label: "Gestión de Carteras",
    color: C.blue,
    test: TEST_CARTERAS,
    abiertas: ABIERTAS_CARTERAS,
  },
];

const EvaluacionFinal = () => {
  const [activo, setActivo] = useState("div");
  const bloque = BLOQUES_EVALUACION.find((b) => b.id === activo);

  return (
    <Card accent={C.ink}>
      <Tag color={C.ink} filled>Evaluación final</Tag>
      <h3
        style={{
          fontFamily: fontDisplay,
          fontSize: 24,
          fontWeight: 500,
          margin: "12px 0 8px",
          color: C.ink,
          letterSpacing: "-0.02em",
        }}
      >
        60 preguntas para revisar lo aprendido
      </h3>
      <p
        style={{
          fontFamily: fontBody,
          fontSize: 13,
          color: C.inkSoft,
          lineHeight: 1.55,
          marginBottom: 18,
        }}
      >
        20 preguntas por bloque (10 tipo test + 10 abiertas). Tus respuestas se
        guardan automáticamente y se envían al profesor.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
        {BLOQUES_EVALUACION.map((b) => (
          <button
            key={b.id}
            onClick={() => setActivo(b.id)}
            style={{
              fontFamily: fontMono,
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "10px 16px",
              border: `1px solid ${activo === b.id ? C.ink : C.rule}`,
              background: activo === b.id ? b.color : "transparent",
              color: activo === b.id ? C.card : C.inkSoft,
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {b.label} · 20
          </button>
        ))}
      </div>

      <div
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.muted,
          marginTop: 8,
          marginBottom: 14,
        }}
      >
        ▸ Tipo test (10)
      </div>
      {bloque.test.map((q) => (
        <Quiz
          key={q.id}
          id={q.id}
          pregunta={q.pregunta}
          opciones={q.opciones}
          correcta={q.correcta}
          explicacion={q.explicacion}
        />
      ))}

      <div
        style={{
          fontFamily: fontMono,
          fontSize: 11,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: C.muted,
          marginTop: 28,
          marginBottom: 14,
        }}
      >
        ▸ Preguntas abiertas (10)
      </div>
      {bloque.abiertas.map((q) => (
        <PreguntaAbierta key={q.id} id={q.id} pregunta={q.pregunta} />
      ))}
    </Card>
  );
};

// ════════════════════════════════════════════════════════════
//  APP
// ════════════════════════════════════════════════════════════

export default function Clase() {
  const { ready, status } = useStudentLessonSync(LESSON_ID);

  if (!ready) {
    return (
      <div
        style={{
          background: C.paper,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: fontBody,
          color: C.muted,
          fontSize: 14,
        }}
      >
        <FontLoader />
        Cargando tus respuestas…
      </div>
    );
  }

  return (
    <div
      style={{
        background: C.paper,
        minHeight: "100vh",
        padding: "0 32px 80px",
        fontFamily: fontBody,
        color: C.ink,
      }}
    >
      <FontLoader />
      <div
        style={{
          position: "fixed",
          top: 14,
          right: 18,
          zIndex: 50,
          background: C.card,
          border: `1px solid ${C.rule}`,
          padding: "6px 12px",
          borderRadius: 999,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <SaveStatusBadge status={status} />
      </div>
      <IndiceStickyCompacto />
      <BotonVolverIndice />
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        <Hero />
        <StorageNotice />
        <IndiceNavegacion />

        {/* ════════════════════════════════════════════════════ */}
        {/* SECCIÓN 1 · DIVERSIFICACIÓN                          */}
        {/* ════════════════════════════════════════════════════ */}
        <section id="seccion-diversificacion" style={{ marginBottom: 80, scrollMarginTop: 24 }}>
          <SectionHeader
            n="01"
            kicker="Primera línea de defensa"
            title="Diversificación"
            lead="Diversificar no es 'comprar muchas cosas'. Es comprar cosas que reaccionen DISTINTO ante los mismos eventos. Si todo lo que tienes depende de lo mismo, no estás diversificado: estás concentrado disfrazado."
          />

          <EnCristiano titulo="La idea más sencilla">
            Imagina que tienes una pastelería y solo vendes tartas de chocolate.
            Si la gente deja de comer chocolate, te arruinas. Si vendes
            tartas, croissants, galletas y café, una mala temporada de
            chocolate no te hunde. Eso es diversificar: <strong>no depender
            de una sola cosa</strong>.
          </EnCristiano>

          <Pull>
            “No pongas todos los huevos en la misma cesta… ni todas las cestas
            en el mismo camión.”
          </Pull>

          <SubHead n="1.1" id="sub-niveles">Niveles de diversificación</SubHead>
          <Body>
            Puedes diversificar en muchas dimensiones a la vez. Cada una te
            protege contra un tipo distinto de problema. La diversificación
            de verdad se mide en{" "}
            <strong>fuentes de riesgo independientes</strong>, no en cuántas
            acciones distintas tienes.
          </Body>
          <NivelesDiversificacion />

          <SubHead n="1.2" id="sub-correlacion">El motor matemático: la correlación</SubHead>

          <EnCristiano titulo="Qué es la correlación, sin matemáticas">
            La correlación es un número entre <strong>−1 y +1</strong> que mide
            si dos activos se mueven igual o no. Si cuando uno sube el otro
            también sube siempre, su correlación es <strong>+1</strong>. Si
            cuando uno sube el otro siempre baja, es <strong>−1</strong>. Si no
            tienen relación, es <strong>0</strong>. Para diversificar bien,
            queremos correlaciones lo más cercanas a 0 (o negativas) que sea
            posible.
          </EnCristiano>

          <Body>
            La correlación es la pieza que hace que la diversificación
            <em> funcione</em>. Sin entenderla, una cartera puede parecer
            diversificada y, en realidad, depender por completo del mismo
            evento.
          </Body>
          <CorrelationScale />

          <EjemploPasoAPaso
            titulo="Caso real: dos acciones del IBEX 35"
            pasos={[
              "Compras 50% Iberdrola y 50% Endesa porque crees que estás diversificando entre dos empresas distintas.",
              "Pero ambas son del sector eléctrico español. Cuando sube el precio del gas, las dos sufren. Cuando el Gobierno regula precios, las dos caen. Su correlación real es ≈ <strong>+0,85</strong>.",
              "Resultado: tienes <strong>2 acciones distintas pero 1 sola fuente de riesgo</strong>. Eso NO es diversificar.",
              "Diversificación real sería 50% Iberdrola + 50% Inditex (distinto sector, distinto factor de riesgo). Correlación más baja, riesgo más bajo.",
            ]}
          />

          <CorrelationLab />

          <Reto
            id="1A"
            titulo="¿Puedes encontrar la correlación que reduce más el riesgo?"
            enunciado="Pon volatilidad A = 25%, volatilidad B = 25%, pesos 50/50. Mueve la correlación. ¿Con qué valor de ρ obtienes la <strong>menor volatilidad de cartera</strong>? ¿Cuánto vale?"
            pista="Cuando ρ = −1, la fórmula tiene mínimo. Pero ¡ojo!: en mercados reales casi nunca se ve ρ = −1. Lo realista es ρ entre 0 y 0,3."
          />

          <SubHead n="1.3" id="sub-casos">Tres casos reales que enseñan</SubHead>
          <Body>
            La teoría se entiende cuando se ve en datos reales. Cambia entre
            los tres casos para descubrir cómo la diversificación —o su
            ausencia— marca la diferencia.
          </Body>
          <CasosPracticos />

          <AplicaEnPlataforma
            titulo="Audita tu cartera con el panel de correlación"
            ruta="Screener"
            tareas={[
              "Entra en el <strong>Screener</strong> de la plataforma.",
              "En el simulador de cartera (panel derecho), añade los valores que tengas en cartera. Si solo tienes 1-2 activos, añade los que estés analizando comprar.",
              "Justo debajo del simulador verás el bloque <strong>'Análisis de correlación'</strong>. Pulsa <strong>'Calcular correlación'</strong>.",
              "Vas a ver 4 KPIs: <em>Correlación media</em>, <em>Diversification ratio</em>, <em>Volatilidad de cartera</em>, <em>Riesgo evitado</em>. Cada uno tiene un diagnóstico semafórico (verde/azul/ámbar/rojo).",
              "Examina el <strong>heatmap NxN</strong>: los pares en rojo (ρ alta) son tus 'duplicados'. Los verdes (ρ baja) son tus joyas diversificadoras.",
              "Cambia el <strong>período</strong> (3m, 6m, 1y, 2y, 5y) para ver cómo varía la correlación. Esto demuestra que NO es estable.",
            ]}
          />

          <SubHead n="1.4" id="sub-factores">Más allá del sector: factores</SubHead>
          <EnCristiano titulo="Sectores ya, ahora factores">
            Hasta ahora hemos hablado de sectores. Pero hay una capa más profunda:
            los <strong>factores</strong>. Un factor es una característica del activo que
            determina cómo va a reaccionar a ciertos eventos. Dos acciones de
            sectores DISTINTOS pueden compartir el mismo factor (por ejemplo,
            una tech y un REIT comparten "sensibilidad a tipos") y caer juntas
            cuando ese factor sufre. Por eso, la diversificación VERDADERA se
            mide en factores, no en sectores.
          </EnCristiano>
          <DiversificacionFactores />

          <SubHead n="1.5" id="sub-plantillas">Plantillas de cartera para experimentar</SubHead>
          <Body>
            La mejor forma de entender la correlación es ver la matriz con
            datos reales. Aquí tienes <strong>4 carteras tipo</strong> que
            puedes copiar y pegar directamente en el simulador del Screener:
            cada una está pensada para enseñar un patrón distinto.
          </Body>
          <PlantillasCartera />

          <Reto
            id="1B"
            titulo="Mide la correlación REAL de tu cartera (en la plataforma)"
            enunciado="Ahora vamos a ver tu cartera con datos reales de Yahoo Finance. <br/><br/>1) Entra al <strong>Screener</strong> de la plataforma. <br/>2) Añade al simulador 4-5 valores que tengas (o que te interesen). <br/>3) Mira el bloque <strong>'Análisis de correlación'</strong> debajo del simulador. Pulsa <strong>'Calcular correlación'</strong>. <br/>4) Apunta los 4 KPIs principales: <br/>&nbsp;&nbsp;&nbsp;• Correlación media: ___ <br/>&nbsp;&nbsp;&nbsp;• Diversification ratio: ___ <br/>&nbsp;&nbsp;&nbsp;• Volatilidad de cartera: ___ <br/>&nbsp;&nbsp;&nbsp;• Riesgo evitado: ___ <br/>5) ¿Cómo se compara tu correlación media con los umbrales? (&lt;0,3 excelente · 0,3-0,55 buena · 0,55-0,75 atención · &gt;0,75 peligro)"
            pista="Si te sale por encima de 0,75 (rojo), tu cartera depende de un solo factor de riesgo. Si te sale por debajo de 0,3, enhorabuena: estás diversificando de verdad. Si está entre 0,55 y 0,75 → revisa qué activos comparten sector y considera sustituir alguno."
          />

          <EnCristiano titulo="¡Cuidado! Tu intuición puede engañarte">
            Mira el siguiente caso REAL. Una cartera con 4 acciones tech del
            S&amp;P 500 (NVDA, GOOGL, AAPL, MSFT) parece poco diversificada.
            El diversity score por sector la marca como{" "}
            <strong style={{ color: C.red }}>"Concentrada"</strong> con 72% en
            Technology. Pero su correlación media REAL en los últimos 6 meses
            es <strong style={{ color: C.green }}>0,27</strong>. ¿Por qué? Porque
            NVDA va a su bola por la narrativa de IA, AAPL responde a sus
            propios ciclos de iPhone, MSFT a su transición cloud, y GOOGL a sus
            métricas publicitarias. <strong>Los sectores no determinan el
            comportamiento</strong>. Por eso los dos análisis son complementarios.
          </EnCristiano>

          <EjemploPasoAPaso
            titulo="Ejemplo real: cartera 4-tech analizada con datos vivos"
            pasos={[
              "Carteras: NVDA (17%) + GOOGL (28%) + AAPL (22%) + MSFT (34%). Inversión total: 1.254 €.",
              "Diversity score por sector: <strong>'Concentrado'</strong>. Avisos: 'min 5 posiciones', 'min 3 sectores', 'Technology pesa 72%'. Todo en rojo.",
              "Correlación media REAL (Yahoo, 6 meses): <strong>0,27</strong> → diagnóstico 'Excelente'.",
              "Diversification ratio: <strong>1,46</strong> → 'Buena'. Vol cartera 19,6% vs 28,6% si todas estuvieran 'pegadas'. Riesgo evitado: 31,4%.",
              "Lectura: la cartera tiene <strong>concentración sectorial pero no concentración de comportamiento</strong> en este período. Los dos avisos son útiles: el de sector dice 'no estás cubierto si cae el factor tech'; el de correlación dice 'pero los activos individuales no se están moviendo igual'. Actuar en consecuencia.",
            ]}
          />

          <Reto
            id="1C"
            titulo="La correlación NO es estable: pruébalo tú"
            enunciado="En el panel de correlación, prueba a cambiar el <strong>período</strong>. Para los mismos tickers de tu cartera: <br/>1) Calcula con período <strong>3 meses</strong>. Apunta correlación media: ___ <br/>2) Calcula con período <strong>1 año</strong>. Apunta: ___ <br/>3) Calcula con período <strong>5 años</strong>. Apunta: ___ <br/>4) ¿Cuál es la diferencia? ¿Por qué crees que cambia? <br/>5) ¿Qué período usarías para tomar decisiones de diversificación a largo plazo?"
            pista="En 5 años verás correlaciones más altas: están incluidas la pandemia 2020 y la crisis de tipos 2022, periodos en los que TODO se movió junto. Eso es exactamente lo que enseña el material teórico: 'en estrés, las correlaciones se disparan'. Lo que parece diversificado en 6 meses puede no serlo en una crisis."
          />

          <Reto
            id="1D"
            titulo="Encuentra la 'joya diversificadora' de tu cartera"
            enunciado="En el heatmap del panel, busca el <strong>par menos correlacionado</strong>. <br/>1) ¿Qué dos tickers son? <br/>2) ¿Qué tienen en común que justifique esa baja correlación? (sectores diferentes, sensibilidad a tipos opuesta, modelos de negocio independientes...) <br/>3) Ahora busca el <strong>par MÁS correlacionado</strong>. Si tuvieras que sustituir uno de los dos, ¿por cuál los cambiarías para bajar la correlación media de la cartera? <br/>4) Plantea esa sustitución y vuelve a calcular. ¿Bajó la correlación media?"
            pista="Activos típicamente poco correlacionados: oro (GLD), bonos largos (TLT), defensivos (XLP, KO, PG), un sector cíclico distinto al que ya tienes. Si tienes 4 tech, mete un GLD o un TLT y verás cómo la correlación media cae claramente."
          />

          <SubHead>Comprueba que lo has entendido</SubHead>
          <Quiz
            id="div1"
            pregunta="Tienes 10 acciones tecnológicas estadounidenses. ¿Estás diversificado?"
            opciones={[
              "Sí, tengo 10 acciones distintas.",
              "Sí, porque las acciones son grandes y líquidas.",
              "No, todas comparten el mismo factor de riesgo (sensibilidad a tipos y narrativa tech-USA).",
              "Depende del importe invertido.",
            ]}
            correcta={2}
            explicacion="Tener 10 acciones del mismo sector y país es diversificación falsa. Las 10 caen juntas cuando suben los tipos o cambia el sentimiento sobre tech. Diversificación real = fuentes de riesgo independientes."
          />
          <Quiz
            id="div2"
            pregunta="Dos activos tienen correlación ρ = +0,9. ¿Qué significa?"
            opciones={[
              "Que no tienen relación.",
              "Que se mueven casi siempre en la misma dirección y combinarlos NO reduce mucho el riesgo.",
              "Que uno cubre al otro.",
              "Que son del mismo sector seguro.",
            ]}
            correcta={1}
            explicacion="ρ = +0,9 es casi correlación perfecta positiva. Combinarlos en cartera reduce muy poco el riesgo total respecto a tener uno solo."
          />
          <Checkpoint id="div-c1">
            Entiendo qué es la correlación y por qué es la pieza clave de la
            diversificación.
          </Checkpoint>
          <Checkpoint id="div-c2">
            He auditado mi cartera de la plataforma y sé en qué nivel(es) de
            diversificación estoy débil.
          </Checkpoint>
        </section>

        {/* ════════════════════════════════════════════════════ */}
        {/* SECCIÓN 2 · GESTIÓN MONETARIA                        */}
        {/* ════════════════════════════════════════════════════ */}
        <section id="seccion-gestion-monetaria" style={{ marginBottom: 80, scrollMarginTop: 24 }}>
          <SectionHeader
            n="02"
            kicker="El puente entre análisis y resultado"
            title="Gestión monetaria"
            lead="La gestión monetaria no decide SI entrar en una operación. Decide CUÁNTO entrar. Es lo que convierte una idea de mercado en una apuesta controlable. Y es la diferencia entre durar 5 años operando o reventar la cuenta en 6 meses."
          />

          <EnCristiano titulo="Una pregunta antes de cada operación">
            La pregunta correcta NO es <em>“¿cuánto puedo ganar?”</em>. La
            pregunta correcta es <em>“¿cuánto estoy dispuesto a perder si me
            equivoco?”</em>. Una vez tienes ese número, el tamaño de la
            posición se deduce solo. No se decide al ojo, no se decide por
            entusiasmo, no se decide por “ya me compensaré”.
          </EnCristiano>

          <SubHead n="2.1" id="sub-tamano">Cuántas acciones puedo comprar</SubHead>
          <Body>
            Esta es la calculadora más importante de toda la asignatura. Se
            usa <strong>antes</strong> de cada operación. Solo necesitas
            cuatro datos: capital, % que arriesgas, precio de entrada, precio
            del stop.
          </Body>

          <EjemploPasoAPaso
            titulo="Caso de andar por casa: 20.000 € de capital"
            pasos={[
              "Tienes <strong>20.000 €</strong> en la cuenta. Decides arriesgar el <strong>1%</strong> en cada operación. Eso son <strong>200 €</strong> que estás dispuesto a perder si te equivocas.",
              "Vas a comprar Iberdrola a <strong>10 €</strong>. El soporte más cercano (donde irá tu stop) está en <strong>9,50 €</strong>. La distancia al stop es de <strong>0,50 € por acción</strong>.",
              "Si compras 1 acción y salta el stop, pierdes 0,50 €. Para perder 200 €, puedes comprar <strong>200 / 0,50 = 400 acciones</strong>.",
              "Tu exposición total es 400 × 10 € = <strong>4.000 €</strong> (un 20% del capital), pero tu pérdida máxima es solo <strong>200 €</strong> (1%). Así NUNCA te arruina una operación mala.",
              "Si te metes en 20 operaciones simultáneas con esta regla y todas fallan a la vez (caso casi imposible), pierdes 20% del capital. Ese es tu drawdown máximo teórico.",
            ]}
          />

          <TamañoPosicion />

          <Reto
            id="2A"
            titulo="Calcula el tamaño de tu próxima operación real"
            enunciado="Coge un valor que tengas en mente comprar (en tu plataforma o en cualquier gráfico). <br/>1) ¿Cuál es tu capital actual? <br/>2) ¿Qué % de riesgo decides? (recuerda: 0,5–2%) <br/>3) ¿A qué precio entrarías? <br/>4) ¿Dónde pondrías el stop (en qué soporte)? <br/>5) ¿Cuántas acciones compras? Apunta los números."
            pista="Si la distancia al stop te pide 1.500 acciones de Inditex y tú solo tienes capital para 500, NO subas el riesgo: descarta esa operación o busca un stop más ajustado (siempre que tenga sentido técnico)."
          />

          <AplicaEnPlataforma
            titulo="Antes de comprar nada en Paper Trading"
            ruta="Charts + Paper Trading"
            tareas={[
              "Abre <strong>Charts</strong> y elige un valor que estés analizando.",
              "Identifica un <strong>soporte técnico</strong> claro debajo del precio actual: usa fractales de Williams o el indicador de soporte/resistencia. El último mínimo relevante.",
              "Calcula con la calculadora de arriba el nº de acciones a comprar.",
              "Pulsa el botón <strong>'Comprar'</strong> de Charts: te lleva a Paper Trading con el ticker pre-rellenado.",
              "Antes de ejecutar la compra, escribe en el <strong>Diario de operaciones</strong> obligatorio: 'Si esta operación falla en SL X €, perderé Y €, que es el Z% de mi cuenta. Justificación técnica: …'.",
              "Si esa frase te incomoda → el tamaño es demasiado grande. Reduce el riesgo o no entres.",
            ]}
          />

          <SubHead n="2.2" id="sub-esperanza">Esperanza matemática</SubHead>

          <EnCristiano titulo="Por qué puedes ganar a la larga aunque pierdas más veces que ganar">
            Mucha gente cree que para ganar en bolsa hay que acertar mucho. Es
            FALSO. Lo que importa es <strong>el balance entre lo que ganas
            cuando ganas y lo que pierdes cuando pierdes</strong>. Si ganas
            300 € las veces que aciertas y pierdes solo 100 € las veces que
            fallas, puedes acertar solo 4 de cada 10 y aún así forrarte.
          </EnCristiano>

          <Body>
            Un sistema profesional necesita lo que se llama{" "}
            <strong>esperanza matemática positiva</strong>. Significa que, si
            repites el sistema mil veces, acabas en verde. NO significa que
            todas las operaciones ganen.
          </Body>

          <EjemploPasoAPaso
            titulo="Por qué un trader con 40% de aciertos puede ser ganador"
            pasos={[
              "Win rate (aciertos): 40% → de cada 10 operaciones, ganas 4 y pierdes 6.",
              "Cuando ganas, ganas de media <strong>300 €</strong>. Cuando pierdes, pierdes de media <strong>100 €</strong>.",
              "En esas 10 operaciones: ganas 4 × 300 € = <strong>+1.200 €</strong>. Pierdes 6 × 100 € = <strong>−600 €</strong>.",
              "Balance neto: +1.200 − 600 = <strong>+600 € cada 10 operaciones</strong>. Sistema GANADOR.",
              "Esperanza matemática por operación = +60 €. Tras 100 operaciones, beneficio esperado = +6.000 €. Habrá rachas malas, pero el balance final converge.",
            ]}
          />

          <EsperanzaMatematica />

          <Pull color={C.red}>
            “El objetivo no es evitar perder. Es perder poco cuando toca
            perder y ganar más cuando toca ganar.”
          </Pull>

          <Reto
            id="2B"
            titulo="Diseña un sistema con esperanza positiva mínima"
            enunciado="Encuentra los valores MÍNIMOS que hacen que tu sistema sea ganador. <br/>1) Si tu win rate es 30%, ¿cuál es el ratio R/R mínimo para no perder? <br/>2) Si tu win rate es 50%, ¿con R/R = 1 ganas? <br/>3) ¿Qué prefieres y por qué: 70% aciertos con R/R 0,8 ó 35% aciertos con R/R 3?"
            pista="Para que E ≥ 0: WinRate × Ganancia ≥ LossRate × Pérdida. Equivale a R/R ≥ (1 − win) / win. Si win = 30%, R/R ≥ 2,33. Si win = 50%, R/R ≥ 1."
          />

          <SubHead n="2.3" id="sub-drawdown">Drawdown · la asimetría que mata cuentas</SubHead>

          <EnCristiano titulo="La trampa matemática que casi nadie ve">
            Si pierdes el 50% de tu cuenta, NO te basta con ganar un 50% para
            recuperarte. Necesitas ganar el <strong>100%</strong>. ¿Por qué?
            Porque la pérdida la calculas sobre tu capital inicial (que era
            mayor) y la recuperación la calculas sobre lo que te queda (que es
            la mitad). Cuanto más profundo el agujero, más exponencialmente
            difícil salir.
          </EnCristiano>

          <Body>
            El <strong>drawdown</strong> es la peor caída que ha sufrido tu
            cartera desde un máximo histórico. Es el concepto más importante
            de toda la gestión del riesgo. Por debajo del 20% es manejable.
            Entre 20–30% es zona crítica. Por encima del 50% el sistema casi
            no puede recuperarse y, encima, viene acompañado de presión
            psicológica brutal.
          </Body>

          <EjemploPasoAPaso
            titulo="Cuenta de 10.000 € que cae al 50%"
            pasos={[
              "Empiezas con <strong>10.000 €</strong>.",
              "Sufres una racha mala y pierdes el 50%. Ahora tienes <strong>5.000 €</strong>.",
              "¿Cuánto necesitas ganar para volver a 10.000 €? <strong>+5.000 € sobre 5.000 € = +100%</strong>. Necesitas duplicar el capital.",
              "Si tu sistema rinde un 15% anual bueno, tardarías ≈ 5 años solo en recuperarte. Más el coste psicológico, más el coste de oportunidad.",
              "Por eso la gestión profesional pone un <strong>tope al drawdown</strong>. Si supera el 15–20%, se reduce el tamaño automáticamente o se para el sistema.",
            ]}
          />

          <DrawdownAsimetrico />

          <Reto
            id="2C"
            titulo="Define tu límite de drawdown personal"
            enunciado="Decide AHORA cuál es tu drawdown máximo tolerable. <br/>1) ¿Qué % de pérdida desde máximo te haría perder la cabeza y romper la disciplina? <br/>2) Ese número (recomendado entre 10% y 20%) es TU LÍMITE. <br/>3) ¿Qué harías si lo alcanzas? (parar 1 semana, reducir tamaño a la mitad, revisar el sistema...) <br/>4) Apunta tu regla concreta."
            pista="Una regla típica de mesa profesional: 'Si llego a un −10% de drawdown, reduzco el tamaño de cada operación a la mitad. Si llego a −15%, paro 1 semana y reviso'."
          />

          <SubHead n="2.4" id="sub-martingala">
            Modelos de gestión · Martingala vs Antimartingala
          </SubHead>

          <EnCristiano titulo="Dos filosofías opuestas">
            <strong>Martingala</strong>: cuando pierdes, dobla la apuesta
            siguiente. Idea: cuando aciertes, recuperas todo lo perdido y un
            poquito más. Suena bien sobre el papel. En la práctica, basta una
            mala racha de 6–7 fallos seguidos para que la apuesta requerida
            sea más grande que tu capital. Te arruina.
            <br />
            <br />
            <strong>Antimartingala</strong>: cuando ganas, sube tamaño un
            poco. Cuando pierdes, vuelve al tamaño base. Idea: aprovecha las
            rachas buenas y se protege en las malas. Es la base de toda
            gestión profesional.
          </EnCristiano>

          <MartingalaVsAnti />

          <Reto
            id="2D"
            titulo="Rompe la martingala"
            enunciado="En el simulador de arriba: <br/>1) Pon win rate 50% (es decir, justo equilibrado). <br/>2) Cambia la semilla varias veces (1, 7, 23, 50, 88...). <br/>3) ¿Cuántas semillas hacen que la martingala acabe en menos de 1.000 €? <br/>4) ¿Qué te dice eso sobre 'estrategias que parecen seguras'?"
            pista="Con win rate 50% y tamaños que se doblan, basta una racha de 6–7 pérdidas seguidas para arrasar la cuenta. Y esas rachas son matemáticamente comunes."
          />

          <AplicaEnPlataforma
            titulo="Aplica gestión monetaria a TODAS tus operaciones"
            ruta="Paper Trading + Backtesting"
            tareas={[
              "Entra en <strong>Paper Trading</strong> y revisa las últimas 10-15 operaciones que has hecho.",
              "Para cada una, calcula: ¿qué % del capital arriesgaste? ¿estuvo entre 0,5 y 2%?",
              "¿Tuviste alguna posición que llegó a representar más del 25% del capital total? Esa fue tu posición de mayor riesgo aunque no lo notaras.",
              "A partir de hoy: <strong>antes de cada nueva orden</strong> en Paper Trading, calcula con la herramienta de arriba el tamaño correcto. Apunta el riesgo € en el campo <em>'Diario de operaciones'</em> obligatorio.",
              "Usa el módulo <strong>Backtesting</strong>: prueba una de las 6 plantillas con stop fijo 5% vs stop fractal. Compara los drawdowns máximos. Verás cómo cambia el riesgo asumible.",
              "Al final del módulo, cuenta cuántas operaciones siguieron la regla del % de riesgo y cuántas no. Esa es tu disciplina real.",
            ]}
          />

          <SubHead>Comprueba que lo has entendido</SubHead>
          <Quiz
            id="gm1"
            pregunta="Tienes 10.000 € de cuenta y arriesgas el 1% por operación. Compras a 50 € con stop a 47 €. ¿Cuántas acciones compras?"
            opciones={[
              "33 acciones (capital / precio).",
              "100 acciones (riesgo / 1).",
              "33 acciones (riesgo €/distancia stop = 100/3).",
              "200 acciones.",
            ]}
            correcta={2}
            explicacion="Riesgo monetario = 10.000 × 1% = 100 €. Distancia al stop = 50−47 = 3 €. Acciones = 100 / 3 ≈ 33. Si salta el stop pierdes 33 × 3 = 99 € (el 1%)."
          />
          <Quiz
            id="gm2"
            pregunta="Tu cuenta cae un 30% desde el máximo. ¿Cuánto tienes que ganar para recuperarte?"
            opciones={["+30%", "+33%", "+42,9%", "+50%"]}
            correcta={2}
            explicacion="% recuperación = % pérdida / (1 − % pérdida) = 30 / 0,7 = 42,86%. La asimetría de la recuperación es lo que hace tan peligrosos los drawdowns profundos."
          />
          <Quiz
            id="gm3"
            pregunta="Un sistema con 35% de aciertos y R/R de 3:1 (ganas 300 € cuando ganas, pierdes 100 € cuando pierdes), ¿es ganador?"
            opciones={[
              "No, pierde más veces que gana.",
              "Sí: E = 0,35×300 − 0,65×100 = +40 € por operación.",
              "Solo si reduces el riesgo.",
              "Solo en mercado alcista.",
            ]}
            correcta={1}
            explicacion="La esperanza matemática es +40 € por operación. Acertar poco con un buen R/R puede ser muy rentable. Acertar mucho con un mal R/R puede ser ruinoso."
          />
          <Checkpoint id="gm-c1">
            Sé calcular el tamaño de posición a partir del % de riesgo y la
            distancia al stop.
          </Checkpoint>
          <Checkpoint id="gm-c2">
            Entiendo por qué la recuperación de un drawdown crece más rápido
            que la pérdida.
          </Checkpoint>
          <Checkpoint id="gm-c3">
            Tengo definido mi % de riesgo por operación y mi drawdown máximo
            tolerable.
          </Checkpoint>
        </section>

        {/* ════════════════════════════════════════════════════ */}
        {/* SECCIÓN 3 · GESTIÓN DE CARTERAS                      */}
        {/* ════════════════════════════════════════════════════ */}
        <section id="seccion-carteras" style={{ marginBottom: 80, scrollMarginTop: 24 }}>
          <SectionHeader
            n="03"
            kicker="Del trade individual al conjunto"
            title="Gestión de carteras"
            lead="Si la gestión monetaria responde a 'cuánto arriesgo en esta operación', la gestión de carteras responde a 'cómo se reparte mi dinero entre activos, qué riesgo total estoy asumiendo, y qué reglas aplico para que la cartera no se descontrole'."
          />

          <EnCristiano titulo="La diferencia con lo anterior">
            La gestión monetaria es <strong>local</strong> (una operación). La
            gestión de carteras es <strong>global</strong> (todo tu dinero
            junto). Puedes tener todas tus operaciones bien dimensionadas y,
            aún así, tener una cartera demasiado concentrada en un sector que,
            si cae, te lleva por delante. La cartera es el conjunto y se
            gestiona como tal.
          </EnCristiano>

          <SubHead n="3.1" id="sub-allocation">
            Asset Allocation · la decisión que más explica el resultado
          </SubHead>

          <EnCristiano titulo="Empezar por lo importante">
            Antes de elegir <em>qué</em> acción concreta comprar, hay que
            decidir <strong>cuánto</strong> de tu dinero va a cada gran
            bloque (acciones, bonos, materias primas, liquidez). Esta decisión
            —que se llama <em>asset allocation</em>— suele explicar la mayor
            parte del comportamiento de tu cartera a largo plazo. Más
            importante que acertar valores concretos.
          </EnCristiano>

          <Body>
            En la práctica se distinguen dos tipos:
          </Body>
          <ul
            style={{
              fontFamily: fontBody,
              fontSize: 14.5,
              lineHeight: 1.7,
              color: C.inkSoft,
              paddingLeft: 22,
              marginBottom: 18,
            }}
          >
            <li>
              <strong>Asignación estratégica</strong>: el reparto base a largo
              plazo, según tu perfil (60/40, 80/20, etc.). No se cambia mucho.
            </li>
            <li>
              <strong>Asignación táctica</strong>: pequeñas desviaciones
              temporales para adaptarse al mercado (reducir RV cuando sube
              mucho la volatilidad, por ejemplo). Se hace con reglas
              explícitas, no por intuición.
            </li>
          </ul>

          <AssetAllocation />

          <Reto
            id="3A"
            titulo="¿Qué perfil eres TÚ?"
            enunciado="Mira los 3 perfiles del simulador. <br/>1) ¿Cuál refleja mejor tu tolerancia real al riesgo? (ojo, no la tolerancia 'de palabra', la real: cuánto puedes ver caer tu cartera sin perder el sueño) <br/>2) ¿Qué horizonte temporal tienes para este dinero? <br/>3) ¿Tu cartera actual de la plataforma se parece a ese perfil o no? <br/>4) Si no, ¿qué harías para acercarla?"
            pista="No hay perfil 'mejor'. El conservador no es 'cobarde' y el agresivo no es 'valiente'. Lo importante es que tu cartera coincida con TU perfil real, no con el que crees que deberías tener."
          />

          <SubHead n="3.2" id="sub-pesos">Cómo asignar los pesos</SubHead>
          <EnCristiano titulo="Capital y riesgo no son lo mismo">
            Imagina que tres amigos aportan 100 € cada uno a una apuesta común.
            Pero uno juega a la ruleta, otro al blackjack y otro a las cartas.
            Aunque hayan puesto la misma cantidad, NO están asumiendo el mismo
            riesgo: el de la ruleta puede perder los 100 € esta noche, el de las
            cartas seguramente no. En tu cartera pasa lo mismo: meter 1.000 € en
            NVDA NO es lo mismo que meter 1.000 € en un bono. El{" "}
            <strong>peso en capital</strong> es cuánto pones; el{" "}
            <strong>peso en riesgo</strong> es cuánto puede afectarte.
          </EnCristiano>
          <SimuladorPesos />
          <Reto
            id="3F"
            titulo="¿Qué activo de tu cartera domina el riesgo?"
            enunciado="Coge tu cartera real (en la plataforma o en papel). Para cada activo, calcula peso_riesgo ≈ peso_capital × volatilidad. ¿Cuál tiene un peso de riesgo mucho mayor que su peso de capital? ¿Lo tenías identificado? ¿Qué harías al respecto?"
            pista="Ejemplo: si NVDA pesa 10% en capital pero σ=45%, contribuye con 4,5 unidades de riesgo. Si SPY pesa 30% pero σ=16%, contribuye con 4,8. Aunque NVDA sea menor en capital, está casi al mismo nivel de riesgo."
          />

          <SubHead n="3.3" id="sub-beta">Riesgo relativo · Beta y Alfa</SubHead>

          <EnCristiano titulo="Beta y Alfa, en cristiano">
            <strong>Beta (β)</strong>: cuánto se mueve tu cartera comparada
            con el mercado. Si β = 1, tu cartera sube y baja igual que el
            mercado. Si β = 1,5, sube y baja un 50% más fuerte. Si β = 0,5, se
            mueve la mitad (más defensiva). Si β es negativa, va al revés
            (cobertura).
            <br />
            <br />
            <strong>Alfa (α)</strong>: lo que tu gestión añade ENCIMA de lo
            que explica la beta. Es el “talento” real, ajustado por riesgo.
            Una cartera con alfa positiva bate al mercado <em>una vez
            ajustado</em> el riesgo que asume.
          </EnCristiano>

          <EjemploPasoAPaso
            titulo="Comparar dos carteras que parecen iguales"
            pasos={[
              "Cartera A: ha rentado 15% el último año. Cartera B: ha rentado 12%. Parece que A es mejor.",
              "Pero la cartera A tiene β = 2 y B tiene β = 1. Es decir, A asume el doble de riesgo de mercado.",
              "El S&P 500 ha subido 10% en ese año. Lo que A 'debía rentar solo por su beta' = 2 × 10% = 20%. Realmente rentó 15%, así que su <strong>alfa = −5%</strong> (peor que su riesgo).",
              "Lo que B 'debía rentar' = 1 × 10% = 10%. Rentó 12%. Su <strong>alfa = +2%</strong> (mejor que su riesgo).",
              "Conclusión: B es mejor gestor que A, aunque a primera vista A 'rentaba más'. Beta ajusta por riesgo. Alfa muestra el talento.",
            ]}
          />

          <BetaSimulator />

          <Reto
            id="3B"
            titulo="Calcula la beta aproximada de tu cartera"
            enunciado="No tienes que hacer una regresión, basta con estimar. <br/>1) Mira tu cartera de la plataforma. <br/>2) Si está llena de acciones tecnológicas → tu β probablemente está entre 1,2 y 1,8. <br/>3) Si está llena de defensivos (utilities, consumo básico) → tu β está entre 0,5 y 0,9. <br/>4) Si es mixta → ≈ 1. <br/>5) Apunta tu estimación. Cuando suba/baje el S&P 10%, ¿qué le pasará a tu cartera?"
            pista="Las carteras concentradas en growth/tech tienen β alta y caen fuerte en correcciones. Las defensivas tienen β baja y aguantan mejor. No hay 'mejor', hay coherencia con tu perfil."
          />

          <SubHead n="3.4" id="sub-rebalanceo">Rebalanceo · mantener la cartera en el carril</SubHead>
          <EjemploPasoAPaso
            titulo="Por qué hace falta rebalancear"
            pasos={[
              "Cartera inicial 60/40 con 10.000 €: <strong>6.000 € RV + 4.000 € RF</strong>.",
              "Tras 24 meses con RV +12%/año y RF +3%/año (sin rebalancear): RV ≈ 7.526 €, RF ≈ 4.243 €. <strong>Peso RV ≈ 64%</strong>. La cartera 'ha crecido' pero también se ha vuelto más arriesgada sin que tú decidieras nada.",
              "Tras 60 meses sin rebalancear: peso RV ≈ <strong>73%</strong>. Tu cartera 'moderada' se ha convertido en 'agresiva' sola.",
              "Lección clave: <strong>rebalancear no es para ganar más</strong>. Es para que la cartera siga siendo la que decidiste que fuera.",
            ]}
          />
          <SimuladorRebalanceo />
          <Reto
            id="3D"
            titulo="¿Cuándo y cómo rebalanceas?"
            enunciado="Define TU regla de rebalanceo: ¿anual? ¿semestral? ¿por umbral del 5%? ¿del 10%? ¿una mezcla? Justifica POR QUÉ. Recuerda: rebalancear obliga a vender ganadores y comprar perdedores. ¿Estás dispuesta?"
            pista="No hay regla 'óptima'. Hay reglas que cumples y reglas que abandonas. Una regla simple que ejecutas siempre supera a una sofisticada que aplicas a medias."
          />

          <SubHead n="3.5" id="sub-metricas">Métricas clave · el cuadro de mando</SubHead>

          <EnCristiano titulo="Sin números, no hay control">
            Las métricas son tu cuadro de mando: te dicen si tu cartera
            funciona o solo parece que funciona. Tres son obligatorias:
            <strong> drawdown máximo</strong> (lo que más has caído),{" "}
            <strong>Sharpe</strong> (rentabilidad ajustada por riesgo) y{" "}
            <strong>volatilidad</strong> (cuánto te mueves). El resto son
            refinamientos.
          </EnCristiano>

          <MetricasGlosario />

          <AplicaEnPlataforma
            titulo="Tus métricas reales en la plataforma"
            ruta="Paper Trading + Histórico"
            tareas={[
              "Entra en <strong>Paper Trading</strong> y revisa tu tabla de posiciones y el resumen de cartera (con su <em>diversity score</em> y distribución sectorial).",
              "Mira tu histórico de órdenes cerradas. Apunta cuántas operaciones tuviste positivas y negativas. Calcula tu % de aciertos real.",
              "Calcula tu R/R real: ¿cuál ha sido tu ganancia media en operaciones positivas y tu pérdida media en operaciones negativas?",
              "Aplica la fórmula: E = winrate × avgWin − lossrate × avgLoss. ¿Da positivo o negativo?",
              "Si E es negativa, ya sabes por qué tu cartera no rinde aunque aciertes. Si es positiva pero el drawdown es alto, hay que afinar el tamaño de posición.",
              "Combina con el panel de correlación del Screener: una cartera con E&gt;0 pero correlación interna 0,9 está expuesta a un único factor de riesgo.",
            ]}
          />

          <Reto
            id="3C"
            titulo="Construye tu propio cuadro de mando"
            enunciado="Anota AQUÍ los 5 números que vas a vigilar a partir de hoy en cada revisión semanal de tu cartera. Por ejemplo: <br/>1) Rentabilidad acumulada: ___ <br/>2) Drawdown actual desde máximo: ___ <br/>3) Volatilidad estimada: ___ <br/>4) % aciertos últimas 20 ops: ___ <br/>5) Ratio R/R medio: ___"
            pista="Si una métrica no la mides, no la controlas. Si no la controlas, te controla ella a ti. Empieza con 5 números, no más."
          />

          <SubHead n="3.6" id="sub-eventos">Plan de eventos extremos</SubHead>
          <EnCristiano titulo="Decidir en frío para no improvisar en caliente">
            Cuando llega la crisis, no tienes tiempo de pensar. Si no tienes
            un plan escrito de antemano, vas a improvisar, y improvisar bajo
            presión es como hacer cirugía sin anestesia: sale mal el 90% de
            las veces. Este ejercicio te obliga a decidir AHORA, en frío, qué
            harás cuando lleguen los problemas. Después, en caliente, solo
            tienes que ejecutar.
          </EnCristiano>
          <PlanEventosExtremos />

          <SubHead n="3.7" id="sub-riesgos">Los 7 riesgos ocultos</SubHead>
          <EnCristiano titulo="Lo que tu cartera no te está contando">
            Una cartera puede parecer perfectamente diversificada y, aun así,
            esconder los siguientes riesgos. La mayoría de inversores se
            centran solo en uno o dos y olvidan los demás. Repasa la lista
            mirando <strong>tu cartera real</strong> y, para cada riesgo,
            pregúntate: ¿estoy expuesto? ¿en qué medida? ¿qué haría si se
            materializa?
          </EnCristiano>
          <RiesgosOcultos />

          <SubHead>Comprueba que lo has entendido</SubHead>
          <Quiz
            id="cart1"
            pregunta="Tu cartera tiene β = 0,6. El S&P 500 cae −15%. Sin contar alfa ni divisa, ¿qué le ocurre aproximadamente a tu cartera?"
            opciones={[
              "Cae −15% (igual que el mercado).",
              "Cae −9% (es defensiva).",
              "Sube +9% (β baja la protege).",
              "No le pasa nada porque β &lt; 1.",
            ]}
            correcta={1}
            explicacion="β × movimiento del mercado = 0,6 × −15% = −9%. Una beta menor que 1 amortigua tanto las subidas como las caídas."
          />
          <Quiz
            id="cart2"
            pregunta="¿Cuál es la decisión que MÁS explica el comportamiento de una cartera a largo plazo?"
            opciones={[
              "Acertar las acciones concretas.",
              "El asset allocation (cómo repartes entre clases de activo).",
              "El timing de entrada.",
              "El bróker que uses.",
            ]}
            correcta={1}
            explicacion="Numerosos estudios muestran que la asignación de activos explica la mayor parte de la varianza del rendimiento de una cartera a largo plazo, más que la selección de valores individuales o el timing."
          />
          <Checkpoint id="cart-c1">
            Distingo entre asignación estratégica (largo plazo) y táctica
            (ajustes temporales).
          </Checkpoint>
          <Checkpoint id="cart-c2">
            Entiendo qué dice la beta y qué dice la alfa de mi cartera.
          </Checkpoint>
          <Checkpoint id="cart-c3">
            Tengo identificadas las 5 métricas que voy a vigilar
            semanalmente.
          </Checkpoint>
        </section>

        {/* ════════════════════════════════════════════════════ */}
        {/* SECCIÓN 4 · PRINCIPIOS                               */}
        {/* ════════════════════════════════════════════════════ */}
        <section id="seccion-principios" style={{ marginBottom: 60, scrollMarginTop: 24 }}>
          <SectionHeader
            n="04"
            kicker="Para llevarse a la práctica"
            title="Cuatro principios irrenunciables"
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 0,
              border: `1px solid ${C.ink}`,
              marginBottom: 28,
            }}
          >
            {[
              {
                t: "Define el riesgo ANTES",
                d: "Antes de cada operación: entrada, stop, objetivo, tamaño. Sin estas cuatro respuestas, no se opera. Punto.",
                c: C.red,
              },
              {
                t: "Limita el daño asumible",
                d: "Riesgo por operación entre 0,5% y 2%. Drawdown máximo tolerable definido y respetado, no negociable.",
                c: C.gold,
              },
              {
                t: "Diversifica de verdad",
                d: "No por número de tickers, por fuentes de riesgo independientes. Vigila la correlación cuando llega el estrés.",
                c: C.blue,
              },
              {
                t: "Mide y revisa",
                d: "Sharpe, Sortino, drawdown, contribución al riesgo. Sin métricas, no hay control real ni mejora posible.",
                c: C.green,
              },
            ].map((x, i, a) => (
              <div
                key={i}
                style={{
                  padding: 24,
                  background: C.card,
                  borderRight:
                    i < a.length - 1 ? `1px solid ${C.ink}` : "none",
                }}
              >
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 56,
                    fontWeight: 700,
                    color: x.c,
                    fontStyle: "italic",
                    lineHeight: 1,
                    marginBottom: 12,
                  }}
                >
                  0{i + 1}
                </div>
                <div
                  style={{
                    fontFamily: fontDisplay,
                    fontSize: 19,
                    fontWeight: 500,
                    color: C.ink,
                    marginBottom: 8,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {x.t}
                </div>
                <div
                  style={{
                    fontFamily: fontBody,
                    fontSize: 13,
                    lineHeight: 1.55,
                    color: C.inkSoft,
                  }}
                >
                  {x.d}
                </div>
              </div>
            ))}
          </div>

          <MiCuaderno />
        </section>

        {/* ════════════════════════════════════════════════════ */}
        {/* SECCIÓN 5 · EVALUACIÓN FINAL                         */}
        {/* ════════════════════════════════════════════════════ */}
        <section id="seccion-evaluacion" style={{ marginBottom: 80, scrollMarginTop: 24 }}>
          <SectionHeader
            n="05"
            kicker="Evaluación final"
            title="60 preguntas para revisar lo aprendido"
            lead="Una pasada completa por los tres bloques. Las respuestas se guardan automáticamente y el profesor las recibe en su panel."
          />
          <EvaluacionFinal />
        </section>

        <PuenteIA />

        {/* Footer */}
        <footer
          style={{
            marginTop: 40,
            paddingTop: 24,
            borderTop: `1px solid ${C.rule}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontFamily: fontMono,
            fontSize: 10,
            letterSpacing: "0.12em",
            color: C.muted,
            textTransform: "uppercase",
            flexWrap: "wrap",
            gap: 12,
          }}
        >
          <div>Análisis Bursátil · Bloque 3</div>
          <div style={{ fontStyle: "italic", textTransform: "none" }}>
            “El mercado no va contra ti. Ni siquiera sabe que existes.”
          </div>
          <div>
            Material académico · No constituye recomendación de inversión
          </div>
        </footer>
      </div>
    </div>
  );
}
