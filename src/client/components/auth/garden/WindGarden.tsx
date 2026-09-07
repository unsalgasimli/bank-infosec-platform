import React, {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  ArrowUpRight,
  Check,
  Pause,
  Play,
  RotateCcw,
  Wind,
  X,
} from "lucide-react";
import { GardenFallback } from "./GardenFallback.js";
import { DayCycleControls } from "./DayCycleControls.js";
import type { DayCycleController } from "./useDayCycle.js";
import {
  createGarden,
  advanceGarden,
  gardenSolved,
  turnInstrument,
  type GardenPhase,
} from "./garden-state.js";

const GardenScene = lazy(() => import("./GardenScene.js"));
class GardenBoundary extends Component<
  { children: React.ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
export function WindGarden({
  dayCycle,
  language,
  phase,
  reducedMotion,
}: {
  dayCycle: DayCycleController;
  language: "az" | "en";
  phase: GardenPhase;
  reducedMotion: boolean;
}) {
  const [state, setState] = useState(() => createGarden());
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState(false);
  const [gust, setGust] = useState(0);
  const [resetView, setResetView] = useState(0);
  const [discovery, setDiscovery] = useState<"bird" | "bell" | null>(null);
  const copy = (en: string, az: string) => (language === "az" ? az : en);
  const turn = useCallback(
    (index: number) => setState((previous) => turnInstrument(previous, index)),
    [],
  );
  const onReady = useCallback(() => setReady(true), []);
  const onLowPerformance = useCallback(() => setPaused(true), []);
  const onUnavailable = useCallback(() => {
    setUnavailable(true);
    setReady(false);
  }, []);
  const solved = gardenSolved(state);
  const finished = state.chapter === 2 && solved;
  useEffect(() => {
    if (!solved) return;
    setOpen(true);
    if (state.chapter !== 1) return;
    const timer = window.setTimeout(
      () => setState((previous) => advanceGarden(previous)),
      1600,
    );
    return () => window.clearTimeout(timer);
  }, [solved, state.chapter]);
  return (
    <section
      className="wind-garden"
      aria-label={copy(
        "The Wind Garden. An optional interactive miniature.",
        "Külək bağı. İnteraktiv miniatür.",
      )}
    >
      <div className="garden-catalog">
        <span className="garden-catalog__line" />
        <span>{copy("THE WIND GARDEN", "KÜLƏK BAĞI")}</span>
        <DayCycleControls
          cycle={dayCycle}
          language={language}
          reducedMotion={reducedMotion}
        />
      </div>
      <div className={`garden-stage ${ready ? "is-ready" : ""}`}>
        <GardenFallback
          bloomed={state.chapter === 2 || solved}
          finished={finished}
        />
        {!unavailable && (
          <GardenBoundary onError={onUnavailable}>
            <Suspense fallback={null}>
              <GardenScene
                daylight={dayCycle.daylight}
                state={state}
                phase={phase}
                paused={paused}
                reducedMotion={reducedMotion}
                gust={gust}
                resetView={resetView}
                onTurn={turn}
                onReady={onReady}
                onLowPerformance={onLowPerformance}
                onUnavailable={onUnavailable}
                onDiscovery={setDiscovery}
              />
            </Suspense>
          </GardenBoundary>
        )}
      </div>
      <div className="garden-caption">
        <span>01 — 03</span>
        <span>
          {copy(
            "Clay. Paper. A passing breeze.",
            "Gil. Kağız. Ötüb keçən meh.",
          )}
        </span>
      </div>
      <div className="garden-editorial">
        <p className="garden-eyebrow">
          {copy("A SMALL WORLD, BEFORE YOURS.", "İŞDƏN ÖNCƏ, KİÇİK BİR DÜNYA.")}
        </p>
        <h1>
          {copy("Let curiosity", "Marağa")}
          <br />
          <em>{copy("take a moment.", "bir an ayırın.")}</em>
        </h1>
        <p>
          {copy(
            "Even a little wind can set something in motion.",
            "Kiçik bir meh belə nəyisə hərəkətə gətirə bilər.",
          )}
        </p>
      </div>
      <div className="garden-bottom">
        <button
          className="garden-explore"
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="garden-puzzle"
        >
          <Wind size={19} />
          {copy("Catch the wind", "Küləyi tut")}
          <ArrowUpRight size={16} />
        </button>
        <span className="garden-drag-hint">
          {unavailable
            ? copy("A quiet view of the garden", "Bağa sakit baxış")
            : copy(
                "Drag to explore · touch a sail",
                "Baxmaq üçün sürüşdürün · yelkənə toxunun",
              )}
        </span>
        <div className="garden-transport">
          <button
            type="button"
            onClick={() => {
              setResetView((n) => n + 1);
              setGust((n) => n + 1);
            }}
            aria-label={copy(
              "Send a breeze and reset view",
              "Meh göndər və görünüşü sıfırla",
            )}
            title={copy("A little breeze", "Kiçik bir meh")}
          >
            <Wind size={17} />
          </button>
          <button
            type="button"
            onClick={() => setPaused((value) => !value)}
            aria-label={copy(
              paused ? "Resume garden" : "Pause garden",
              paused ? "Bağı canlandır" : "Bağı dayandır",
            )}
            aria-pressed={paused}
            disabled={reducedMotion}
          >
            {paused || reducedMotion ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
      </div>
      {open && (
        <div
          className="garden-puzzle"
          id="garden-puzzle"
          data-chapter={state.chapter}
          data-complete={finished}
        >
          <div className="garden-puzzle__heading">
            <span>
              {state.chapter === 1
                ? copy("01 / THE FIRST BLOOM", "01 / İLK ÇİÇƏK")
                : copy("02 / THE SECRET WIND", "02 / GİZLİ KÜLƏK")}
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={copy("Close wind puzzle", "Külək oyununu bağla")}
            >
              <X size={17} />
            </button>
          </div>
          <h2 aria-live="polite">
            {finished
              ? copy("The garden has a secret.", "Bağın bir sirri var.")
              : solved
                ? copy("A second breeze is waking…", "İkinci meh oyanır…")
                : state.chapter === 2
                  ? copy(
                      "The sails are connected now.",
                      "Yelkənlər indi bir-birinə bağlıdır.",
                    )
                  : copy(
                      "Three sails. One perfect breeze.",
                      "Üç yelkən. Bir mükəmməl meh.",
                    )}
          </h2>
          <p>
            {finished
              ? copy(
                  "A moonflower opens. Paper butterflies take flight. You brought this little world to life.",
                  "Ay çiçəyi açılır. Kağız kəpənəklər uçuşur. Bu kiçik dünyanı siz oyatdınız.",
                )
              : state.chapter === 2
                ? copy(
                    "Each turn also moves the next sail: 01 → 02 → 03 → 01. Align all three to reveal what sleeps beneath the arch.",
                    "Hər gediş növbəti yelkəni də çevirir: 01 → 02 → 03 → 01. Tağın altındakı sirri açmaq üçün üçünü də uyğunlaşdırın.",
                  )
                : copy(
                    "Turn each copper pointer toward its green mark. Something is waiting to bloom.",
                    "Hər mis əqrəbi yaşıl nişana yönəldin. Nəsə çiçəklənməyi gözləyir.",
                  )}
          </p>
          <div className="garden-dials">
            {state.turns.map((value, i) => (
              <button
                key={i}
                type="button"
                disabled={solved}
                onClick={() => turn(i)}
                aria-label={copy(
                  `Turn sail ${i + 1}: position ${(value % 8) + 1}, target ${state.targets[i] + 1}`,
                  `${i + 1}-ci yelkəni çevir: mövqe ${(value % 8) + 1}, hədəf ${state.targets[i] + 1}`,
                )}
              >
                <span className="garden-dial">
                  <svg viewBox="0 0 64 64" aria-hidden="true">
                    <circle cx="32" cy="32" r="25" />
                    {Array.from({ length: 8 }, (_, n) => (
                      <circle
                        key={n}
                        cx={32 + Math.sin((n * Math.PI) / 4) * 25}
                        cy={32 - Math.cos((n * Math.PI) / 4) * 25}
                        r={state.targets[i] === n ? 4 : 1.7}
                        className={state.targets[i] === n ? "is-target" : ""}
                      />
                    ))}
                    <path
                      d="M32 32V13"
                      transform={`rotate(${value * 45} 32 32)`}
                    />
                    <circle cx="32" cy="32" r="3" />
                  </svg>
                </span>
                <span>
                  0{i + 1}{" "}
                  {value % 8 === state.targets[i] ? (
                    <Check size={12} />
                  ) : (
                    <RotateCcw size={12} />
                  )}
                </span>
              </button>
            ))}
          </div>
          <div className="garden-puzzle__footer">
            <span role="status">
              {state.moves} {copy("turns", "gediş")} ·{" "}
              {state.turns.filter((v, i) => v % 8 === state.targets[i]).length}
              /3
            </span>
            <button
              type="button"
              onClick={() => setState(createGarden(state.round + 1))}
            >
              <RotateCcw size={12} />
              {copy("Start again", "Yenidən başla")}
            </button>
          </div>
        </div>
      )}
      {discovery && !open && (
        <p className="garden-discovery" role="status">
          {discovery === "bird"
            ? copy("The gardener says hello.", "Bağban sizi salamlayır.")
            : copy(
                "A small bell. A very large silence.",
                "Kiçik bir zəng. Böyük bir sükut.",
              )}
          <button
            onClick={() => setDiscovery(null)}
            type="button"
            aria-label={copy("Dismiss", "Bağla")}
          >
            <X size={12} />
          </button>
        </p>
      )}
    </section>
  );
}
