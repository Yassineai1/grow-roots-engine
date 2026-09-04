import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { useMyBusiness } from "@/lib/useMyBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/services")({
  head: () => ({
    meta: [
      { title: "Services | Fitly Business Platform" },
      { name: "description", content: "Create and manage the services your business offers." },
      { property: "og:title", content: "Services | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Create and manage the services your business offers.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ServicesPage,
});

type ServiceForm = {
  id?: string;
  name: string;
  description: string;
  service_type: "one_on_one" | "group_class";
  duration_minutes: number;
  price: number;
  capacity: number;
  requires_payment: boolean;
};

const emptyForm: ServiceForm = {
  name: "",
  description: "",
  service_type: "one_on_one",
  duration_minutes: 60,
  price: 0,
  capacity: 1,
  requires_payment: false,
};

const input =
  "ui-input";

function ServicesPage() {
  const qc = useQueryClient();
  const { data: business } = useMyBusiness();
  const [form, setForm] = useState<ServiceForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const { data: services, isLoading } = useQuery({
    queryKey: ["services", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("services")
        .select("*")
        .eq("business_id", business!.id)
        .order("created_at", { ascending: false });
      if (e) throw e;
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async (values: ServiceForm) => {
      const payload = {
        business_id: business!.id,
        name: values.name.trim(),
        description: values.description.trim() || null,
        service_type: values.service_type,
        duration_minutes: values.duration_minutes,
        price: values.price,
        capacity: values.service_type === "one_on_one" ? 1 : values.capacity,
        requires_payment: values.requires_payment,
      };
      const { error: e } = values.id
        ? await supabase.from("services").update(payload).eq("id", values.id)
        : await supabase.from("services").insert(payload);
      if (e) throw e;
    },
    onSuccess: () => {
      setForm(emptyForm);
      setError(null);
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggle = useMutation({
    mutationFn: async (s: { id: string; is_active: boolean }) => {
      const { error: e } = await supabase
        .from("services")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error: e } = await supabase.from("services").delete().eq("id", id);
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
    onError: (e: Error) =>
      setError(
        e.message.includes("violates foreign key")
          ? "This service has bookings and cannot be deleted. Deactivate it instead."
          : e.message,
      ),
  });

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.duration_minutes <= 0) return setError("Duration must be greater than 0.");
    if (form.price < 0) return setError("Price cannot be negative.");
    if (form.capacity <= 0) return setError("Capacity must be greater than 0.");
    save.mutate(form);
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <DashboardNav />
      <h1 className="mt-6 text-2xl font-semibold text-foreground">Services</h1>

      <form onSubmit={onSubmit} className="ui-card mt-4 grid gap-3 p-5 sm:grid-cols-2">
        <input
          required
          className={input}
          placeholder="Service name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <select
          className={input}
          value={form.service_type}
          onChange={(e) =>
            setForm({
              ...form,
              service_type: e.target.value as ServiceForm["service_type"],
              capacity: e.target.value === "one_on_one" ? 1 : form.capacity,
            })
          }
        >
          <option value="one_on_one">One-on-one</option>
          <option value="group_class">Group class</option>
        </select>
        <input
          className={`${input} sm:col-span-2`}
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          required
          type="number"
          min={1}
          className={input}
          placeholder="Duration (minutes)"
          value={form.duration_minutes}
          onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
        />
        <input
          required
          type="number"
          min={0}
          step="0.01"
          className={input}
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
        />
        <input
          required
          type="number"
          min={1}
          disabled={form.service_type === "one_on_one"}
          className={input}
          placeholder="Capacity"
          value={form.capacity}
          onChange={(e) => setForm({ ...form, capacity: Number(e.target.value) })}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground sm:col-span-2">
          <input
            type="checkbox"
            checked={form.requires_payment}
            onChange={(e) => setForm({ ...form, requires_payment: e.target.checked })}
            className="h-4 w-4 accent-primary"
          />
          Require online payment for this service
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={save.isPending || !business}
            className="ui-btn"
          >
            {form.id ? "Save changes" : "Add service"}
          </button>
          {form.id && (
            <button
              type="button"
              onClick={() => setForm(emptyForm)}
              className="ui-btn-secondary"
            >
              Cancel
            </button>
          )}
        </div>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
      </form>

      <div className="mt-6 space-y-2">
        {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading...</p>}
        {services?.length === 0 && <p className="ui-card block p-6 text-center text-sm text-muted-foreground">No services yet. Create your first service above.</p>}
        {services?.map((s) => (
          <div
            key={s.id}
            className="flex flex-wrap items-center justify-between gap-2 ui-card p-4"
          >
            <div>
              <p className="text-sm font-medium text-foreground">
                {s.name} {!s.is_active && <span className="text-muted-foreground">(inactive)</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                {s.service_type === "group_class" ? "Group class" : "One-on-one"} ·{" "}
                {s.duration_minutes} min · {s.price} · capacity {s.capacity}
              </p>
              {s.requires_payment && (
                <span className="ui-badge mt-1 text-primary">Payment required</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setForm({
                    id: s.id,
                    name: s.name,
                    description: s.description ?? "",
                    service_type: s.service_type as ServiceForm["service_type"],
                    duration_minutes: s.duration_minutes,
                    price: Number(s.price),
                    capacity: s.capacity,
                    requires_payment: s.requires_payment,
                  })
                }
                className="ui-btn-secondary text-xs"
              >
                Edit
              </button>
              <button
                onClick={() => toggle.mutate({ id: s.id, is_active: s.is_active })}
                className="ui-btn-secondary text-xs"
              >
                {s.is_active ? "Deactivate" : "Activate"}
              </button>
              <button
                onClick={() => remove.mutate(s.id)}
                className="ui-btn-secondary text-xs text-destructive"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
