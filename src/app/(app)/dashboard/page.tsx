"use client";

import { useEffect, useMemo, useState } from "react";
import { Topbar } from "@/components/shell/Topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listAllCards, getCurrentStreak, getSettings } from "@/store/decks";
import {
  getReviewStatsBetween,
  useReviewsByDay,
  useHeatmapData,
  useCardDistribution,
} from "@/lib/stats";
import type { Settings } from "@/lib/db";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Flame,
  Target,
  TrendingUp,
  BarChart3,
  Sparkles,
  Gauge,
} from "lucide-react";

type ReviewStats = Awaited<ReturnType<typeof getReviewStatsBetween>>;

const DAY_MS = 24 * 60 * 60 * 1000;

function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

function formatDelta(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "" : "";
  return `${sign}${Math.round(value * 100)}%`;
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0 min";
  if (minutes < 1) return "<1 min";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const remaining = Math.round(minutes % 60);
  return remaining > 0 ? `${hours} h ${remaining} min` : `${hours} h`;
}

function getMotivationLine(streak: number, studiedToday: number, weekDelta: number): string {
  if (studiedToday === 0) return "Vous n'avez rien fait aujourd'hui — c'est une bonne journée pour recommencer.";
  if (streak >= 7) return "Super régularité cette semaine. Continuez sur cette lancée.";
  if (weekDelta > 0.1) return "Vous êtes en progrès par rapport à la semaine dernière.";
  if (streak > 0) return "Belle constance. Chaque session compte.";
  return "Vous êtes sur la bonne voie. Un petit effort aujourd'hui peut tout changer.";
}

function AdvancedStatsSection() {
  const reviewsByDay = useReviewsByDay(30);
  const heatmapData = useHeatmapData(90);
  const cardDistribution = useCardDistribution();

  const formatChartDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("fr-FR", { month: "short", day: "numeric" });
  };

  const pieData = cardDistribution
    ? [
        { name: "Nouvelles", value: cardDistribution.new, color: "#3b82f6" },
        { name: "En apprentissage", value: cardDistribution.learning, color: "#f97316" },
        { name: "Apprises", value: cardDistribution.learned, color: "#22c55e" },
      ].filter((d) => d.value > 0)
    : [];

  const totalCards = pieData.reduce((sum, item) => sum + item.value, 0);

  const formatLegend = (value: string, entry: any) => {
    const cardValue = entry?.payload?.value ?? 0;
    const percentage = totalCards > 0 && cardValue > 0
      ? ((cardValue / totalCards) * 100).toFixed(1)
      : "0.0";
    const plural = cardValue > 1 ? "s" : "";
    return `${value} : ${cardValue} carte${plural} (${percentage}%)`;
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-2 hover:border-primary/30 transition-all">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 p-2">
                <BarChart3 className="h-4 w-4 text-primary" />
              </div>
              <CardTitle className="text-lg font-bold">Activité (90 derniers jours)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="flex items-center justify-center py-4">
            {heatmapData !== undefined ? (
              <ActivityHeatmap data={heatmapData} days={90} />
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                <div className="animate-pulse">Chargement...</div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-2 hover:border-accent/30 transition-all">
          <CardHeader>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-gradient-to-br from-accent/20 to-accent/10 p-2">
                <TrendingUp className="h-4 w-4 text-accent" />
              </div>
              <CardTitle className="text-lg font-bold">Révisions par jour (30 jours)</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {reviewsByDay !== undefined ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={reviewsByDay}>
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/30" />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatChartDate}
                    className="text-xs"
                    stroke="currentColor"
                    opacity={0.6}
                  />
                  <YAxis className="text-xs" stroke="currentColor" opacity={0.6} />
                  <RechartsTooltip
                    labelFormatter={(label) => formatChartDate(label)}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "2px solid hsl(var(--border))",
                      borderRadius: "1rem",
                      boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 2, stroke: "hsl(var(--background))" }}
                    activeDot={{ r: 6 }}
                    fill="url(#colorCount)"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                <div className="animate-pulse">Chargement...</div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-2 hover:border-primary/30 transition-all">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 p-2">
              <Target className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-lg font-bold">Répartition des cartes</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="px-2 py-4">
          {cardDistribution !== undefined ? (
            pieData.length > 0 ? (
              <div className="w-full h-[280px] flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="45%"
                      labelLine={false}
                      label={false}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Legend
                      verticalAlign="bottom"
                      height={60}
                      wrapperStyle={{
                        paddingTop: "20px",
                        fontSize: "14px",
                        fontWeight: "600",
                      }}
                      formatter={formatLegend}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
                <div className="animate-pulse">Aucune carte</div>
              </div>
            )
          ) : (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              <div className="animate-pulse">Chargement...</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function DashboardPage() {
  const [streak, setStreak] = useState(0);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [todayStats, setTodayStats] = useState<ReviewStats | null>(null);
  const [weekStats, setWeekStats] = useState<ReviewStats | null>(null);
  const [prevWeekStats, setPrevWeekStats] = useState<ReviewStats | null>(null);
  const [overallTotals, setOverallTotals] = useState({ total: 0, mastered: 0 });
  const [loading, setLoading] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function loadStats() {
      try {
        const now = new Date();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const weekStart = new Date(now.getTime() - 6 * DAY_MS);
        weekStart.setHours(0, 0, 0, 0);
        const prevWeekStart = new Date(weekStart.getTime() - 7 * DAY_MS);
        const prevWeekEnd = new Date(weekStart.getTime() - 1);

        const [
          today,
          week,
          prevWeek,
          streakValue,
          settingsValue,
          allCards,
        ] = await Promise.all([
          getReviewStatsBetween(todayStart.toISOString(), now.toISOString()),
          getReviewStatsBetween(weekStart.toISOString(), now.toISOString()),
          getReviewStatsBetween(prevWeekStart.toISOString(), prevWeekEnd.toISOString()),
          getCurrentStreak(),
          getSettings(),
          listAllCards(),
        ]);

        if (!mounted) return;

        setTodayStats(today);
        setWeekStats(week);
        setPrevWeekStats(prevWeek);
        setStreak(streakValue);
        setSettings(settingsValue);

        const activeCards = allCards.filter((card) => !card.suspended);
        const totalCards = activeCards.length;
        const mastered = activeCards.filter((card) => card.state === "review").length;
        setOverallTotals({ total: totalCards, mastered });
      } catch (error) {
        console.error("Error loading stats:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadStats();
    return () => {
      mounted = false;
    };
  }, []);

  const dailyTarget = settings?.new_cards_per_day ?? 20;
  const studiedToday = todayStats?.totalReviews ?? 0;
  const timeToday = todayStats?.totalMinutes ?? 0;
  const objectiveReached = studiedToday >= dailyTarget;

  const weekRetention = weekStats?.retentionRate ?? 0;
  const prevWeekRetention = prevWeekStats?.retentionRate ?? 0;
  const retentionDelta = weekRetention - prevWeekRetention;

  const weekMinutes = weekStats?.totalMinutes ?? 0;
  const prevWeekMinutes = prevWeekStats?.totalMinutes ?? 0;
  const weekHours = weekMinutes / 60;
  const prevWeekHours = prevWeekMinutes / 60;
  const efficiencyScore = weekHours > 0 ? weekRetention / weekHours : 0;
  const prevEfficiencyScore = prevWeekHours > 0 ? prevWeekRetention / prevWeekHours : 0;
  const efficiencyDelta = efficiencyScore - prevEfficiencyScore;

  const masteredPct = overallTotals.total > 0 ? overallTotals.mastered / overallTotals.total : 0;

  const motivationLine = getMotivationLine(streak, studiedToday, retentionDelta);

  const insightLine = useMemo(() => {
    if (studiedToday === 0) {
      return "Vous avez une opportunité aujourd'hui pour relancer votre rythme.";
    }
    if (retentionDelta > 0.05) {
      return "Votre rétention augmente cette semaine — continuez comme ça.";
    }
    if (efficiencyDelta < -0.05) {
      return "Votre efficacité baisse légèrement : des sessions plus courtes peuvent aider.";
    }
    if (streak >= 5) {
      return "Votre constance s'installe, et ça fait la différence.";
    }
    return "Votre progression est régulière — gardez ce tempo.";
  }, [studiedToday, retentionDelta, efficiencyDelta, streak]);

  return (
    <>
      <Topbar title="Statistiques" />
      <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-background to-muted/20">
        <div className="mx-auto max-w-6xl space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight">Votre progression</h1>
              <p className="text-muted-foreground">Un aperçu rapide pour garder la motivation.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowAdvanced((prev) => !prev)}>
              {showAdvanced ? "Masquer les stats avancées" : "Stats avancées"}
            </Button>
          </div>

          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                </div>
                <CardTitle className="text-lg font-bold">Résumé du jour</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-4">
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cartes revues</p>
                  <p className="text-3xl font-extrabold text-primary">{loading ? "…" : studiedToday}</p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temps étudié</p>
                  <p className="text-3xl font-extrabold text-primary">{loading ? "…" : formatMinutes(timeToday)}</p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objectif du jour</p>
                  <p className="text-2xl font-semibold text-foreground">
                    {loading ? "…" : objectiveReached ? "Objectif atteint" : "Objectif en cours"}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {loading ? "" : `${studiedToday}/${dailyTarget} cartes`}
                  </p>
                </div>
                <div className="rounded-xl border bg-background p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Série</p>
                    <Flame className="h-4 w-4 text-orange-500" />
                  </div>
                  <p className="text-3xl font-extrabold text-orange-500">{loading ? "…" : streak}</p>
                  <p className="text-xs text-muted-foreground">jours consécutifs</p>
                </div>
              </div>
              <p className="mt-4 text-sm text-muted-foreground">{motivationLine}</p>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base font-bold">Progression globale</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Cartes maîtrisées</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-primary">{formatPercent(masteredPct)}</p>
                    <p className="text-xs text-muted-foreground">{overallTotals.mastered} / {overallTotals.total}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Cartes apprises</p>
                  <p className="text-2xl font-bold text-primary">{overallTotals.mastered}</p>
                  <p className="text-xs text-muted-foreground">Total à ce jour</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <CardTitle className="text-base font-bold">Rétention (7 jours)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-extrabold text-primary">{formatPercent(weekRetention)}</p>
                  <p className={`text-xs font-semibold ${retentionDelta >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {formatDelta(retentionDelta)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Comparé à la semaine précédente</p>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base font-bold">Efficacité d'apprentissage</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-baseline gap-2">
                  <p className="text-3xl font-extrabold text-primary">
                    {weekHours > 0 ? (efficiencyScore * 100).toFixed(1) : "0.0"}
                  </p>
                  <p className={`text-xs font-semibold ${efficiencyDelta >= 0 ? "text-emerald-600" : "text-amber-600"}`}>
                    {efficiencyDelta === 0 ? "= 0" : (efficiencyDelta > 0 ? "+" : "") + (efficiencyDelta * 100).toFixed(1)}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Plus c'est élevé, mieux vous retenez avec moins de temps.</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Cette semaine en un coup d'œil</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cartes revues</p>
                <p className="text-2xl font-bold text-primary">{loading ? "…" : weekStats?.totalReviews ?? 0}</p>
                <p className="text-xs text-muted-foreground">Semaine en cours</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Temps étudié</p>
                <p className="text-2xl font-bold text-primary">{loading ? "…" : formatMinutes(weekStats?.totalMinutes ?? 0)}</p>
                <p className="text-xs text-muted-foreground">Semaine en cours</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Série actuelle</p>
                <p className="text-2xl font-bold text-primary">{loading ? "…" : streak} jours</p>
                <p className="text-xs text-muted-foreground">Consécutifs</p>
              </div>
              <div className="rounded-lg border bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Rétention (7 jours)</p>
                <p className="text-2xl font-bold text-primary">{formatPercent(weekRetention)}</p>
                <p className="text-xs text-muted-foreground">Taux moyen</p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-2">
            <CardHeader>
              <CardTitle className="text-lg font-bold">Moment motivation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                {insightLine}
              </div>
            </CardContent>
          </Card>

          {showAdvanced && <AdvancedStatsSection />}
        </div>
      </div>
    </>
  );
}
