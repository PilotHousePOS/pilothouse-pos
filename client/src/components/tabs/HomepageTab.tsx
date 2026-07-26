import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getActiveTenantSlug } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, Home, Palette, LayoutGrid, Type } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CardConfig {
  title: string;
  actionLabel: string;
  description: string;
  emoji: string;
  theme: string;
}

interface HomepageConfig {
  welcomeText?: string;
  brandName?: string;
  subtitle?: string;
  sectionTitle?: string;
  brandGradient?: { from: string; via: string; to: string };
  cards?: CardConfig[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<HomepageConfig> = {
  welcomeText: "Welcome to",
  brandName: "PilotHouse",
  subtitle: "Your business, fully equipped",
  sectionTitle: "What We Offer",
  brandGradient: { from: "#3b82f6", via: "#ef4444", to: "#f97316" },
  cards: [
    { title: "Products",     actionLabel: "Shop Now",     description: "Browse our catalog",  emoji: "🛍️", theme: "blue"   },
    { title: "Book Service", actionLabel: "Schedule Now", description: "Appointments",         emoji: "📅", theme: "green"  },
    { title: "Loyalty",      actionLabel: "Earn Points",  description: "Rewards & Discounts",  emoji: "⭐", theme: "purple" },
    { title: "Orders",       actionLabel: "View History", description: "Track your orders",    emoji: "📦", theme: "orange" },
  ],
};

const THEME_LABELS: Record<string, string> = {
  blue: "🔵", green: "🟢", purple: "🟣", orange: "🟠",
  red: "🔴", teal: "🩵", pink: "🩷", yellow: "🟡",
};

function mergeConfig(saved: HomepageConfig): Required<HomepageConfig> {
  return {
    welcomeText:   saved.welcomeText   ?? DEFAULT_CONFIG.welcomeText,
    brandName:     saved.brandName     ?? DEFAULT_CONFIG.brandName,
    subtitle:      saved.subtitle      ?? DEFAULT_CONFIG.subtitle,
    sectionTitle:  saved.sectionTitle  ?? DEFAULT_CONFIG.sectionTitle,
    brandGradient: saved.brandGradient ?? DEFAULT_CONFIG.brandGradient,
    cards: (saved.cards ?? DEFAULT_CONFIG.cards).map((c, i) => ({
      ...DEFAULT_CONFIG.cards[i],
      ...c,
    })),
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomepageTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const slug = getActiveTenantSlug();

  const { data: savedConfig, isLoading } = useQuery<HomepageConfig>({
    queryKey: ["/api/homepage-config"],
  });

  const config = mergeConfig(savedConfig ?? {});
  const [draft, setDraft] = useState<Required<HomepageConfig> | null>(null);

  // Start editing from the latest saved config whenever the user clicks "Edit"
  const editing = draft ?? config;
  const [isEditing, setIsEditing] = useState(false);

  const startEdit = () => {
    setDraft(JSON.parse(JSON.stringify(config)));
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setDraft(null);
    setIsEditing(false);
  };

  const setCard = (i: number, patch: Partial<CardConfig>) => {
    setDraft(d => {
      if (!d) return d;
      const cards = d.cards.map((c, idx) => idx === i ? { ...c, ...patch } : c);
      return { ...d, cards };
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: Required<HomepageConfig>) => {
      const res = await fetch("/api/admin/homepage-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(slug ? { "X-Tenant-Slug": slug } : {}) },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error((await res.json()).message ?? "Save failed");
    },
    onSuccess: () => {
      toast({ title: "Homepage updated!", description: "Customers will see your changes right away." });
      qc.invalidateQueries({ queryKey: ["/api/homepage-config"] });
      setDraft(null);
      setIsEditing(false);
    },
    onError: (e: any) => {
      toast({ title: "Save failed", description: e.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading homepage config…</p>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Home className="w-5 h-5 text-muted-foreground" />
          <div>
            <h2 className="text-xl font-semibold">Customer Homepage</h2>
            <p className="text-sm text-muted-foreground">Customize the hero, tagline, and service cards your customers see.</p>
          </div>
        </div>
        {!isEditing && (
          <Button onClick={startEdit} size="sm">Edit Homepage</Button>
        )}
      </div>

      {/* ── Hero Section ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Type className="w-4 h-4" /> Hero Section
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-muted-foreground">Intro text</Label>
              {isEditing ? (
                <Input
                  value={editing.welcomeText}
                  onChange={e => setDraft(d => d ? { ...d, welcomeText: e.target.value } : d)}
                  placeholder="Welcome to"
                />
              ) : (
                <p className="text-sm font-medium mt-1">{config.welcomeText}</p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Brand / business name</Label>
              {isEditing ? (
                <Input
                  value={editing.brandName}
                  onChange={e => setDraft(d => d ? { ...d, brandName: e.target.value } : d)}
                  placeholder="PilotHouse"
                />
              ) : (
                <p className="text-sm font-medium mt-1">{config.brandName}</p>
              )}
            </div>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Tagline / subtitle</Label>
            {isEditing ? (
              <Input
                value={editing.subtitle}
                onChange={e => setDraft(d => d ? { ...d, subtitle: e.target.value } : d)}
                placeholder="Your business, fully equipped"
              />
            ) : (
              <p className="text-sm font-medium mt-1">{config.subtitle}</p>
            )}
          </div>

          {/* Gradient */}
          <div>
            <Label className="text-xs text-muted-foreground">Brand name gradient</Label>
            {isEditing ? (
              <div className="flex items-center gap-2 mt-1">
                {(["from", "via", "to"] as const).map(stop => (
                  <div key={stop} className="flex-1">
                    <p className="text-[10px] text-muted-foreground mb-1 capitalize">{stop}</p>
                    <div className="flex items-center gap-1.5 border rounded-md px-2 py-1">
                      <input
                        type="color"
                        value={editing.brandGradient[stop]}
                        onChange={e => setDraft(d => d ? { ...d, brandGradient: { ...d.brandGradient, [stop]: e.target.value } } : d)}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"
                      />
                      <span className="text-xs text-muted-foreground font-mono">{editing.brandGradient[stop]}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
            <p
              className="text-center text-xl font-bold mt-2 bg-clip-text text-transparent"
              style={{ backgroundImage: `linear-gradient(to right, ${editing.brandGradient.from}, ${editing.brandGradient.via}, ${editing.brandGradient.to})` }}
            >
              {editing.brandName || "Preview"}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* ── Offer Section ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutGrid className="w-4 h-4" /> Offer Section
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Label className="text-xs text-muted-foreground">Section heading</Label>
          {isEditing ? (
            <Input
              value={editing.sectionTitle}
              onChange={e => setDraft(d => d ? { ...d, sectionTitle: e.target.value } : d)}
              placeholder="What We Offer"
              className="mt-1"
            />
          ) : (
            <p className="text-sm font-medium mt-1">{config.sectionTitle}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Service Cards ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="w-4 h-4" /> Service Cards
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {editing.cards.map((card, i) => (
              <div key={i} className="border rounded-xl p-3 bg-muted/30">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Card {i + 1}</p>
                {isEditing ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <Label className="text-xs text-muted-foreground">Emoji</Label>
                        <Input
                          value={card.emoji}
                          onChange={e => setCard(i, { emoji: e.target.value })}
                          className="text-center text-lg"
                          maxLength={2}
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Color</Label>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Object.keys(THEME_LABELS).map(t => (
                            <button
                              key={t}
                              onClick={() => setCard(i, { theme: t })}
                              title={t}
                              className={`w-7 h-7 rounded-full text-sm flex items-center justify-center border-2 transition-all ${card.theme === t ? "border-gray-800 scale-110" : "border-transparent"}`}
                            >
                              {THEME_LABELS[t]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div>
                        <Label className="text-xs text-muted-foreground">Title</Label>
                        <Input value={card.title} onChange={e => setCard(i, { title: e.target.value })} placeholder="Title" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Action label</Label>
                        <Input value={card.actionLabel} onChange={e => setCard(i, { actionLabel: e.target.value })} placeholder="Shop Now" />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">Description</Label>
                        <Input value={card.description} onChange={e => setCard(i, { description: e.target.value })} placeholder="Browse our catalog" />
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-2">
                    <span className="text-2xl">{card.emoji}</span>
                    <div>
                      <p className="font-medium text-sm">{card.title}</p>
                      <p className="text-xs text-muted-foreground">{card.description}</p>
                      <p className="text-xs text-blue-600 mt-0.5">{card.actionLabel}</p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Save / Cancel bar ── */}
      {isEditing && (
        <div className="flex gap-2 pt-1">
          <Button variant="outline" onClick={cancelEdit} className="flex-1">Cancel</Button>
          <Button
            onClick={() => draft && saveMutation.mutate(draft)}
            disabled={saveMutation.isPending || !draft}
            className="flex-1"
          >
            {saveMutation.isPending ? "Saving…" : <><Check className="w-4 h-4 mr-1" /> Save Changes</>}
          </Button>
        </div>
      )}
    </div>
  );
}
