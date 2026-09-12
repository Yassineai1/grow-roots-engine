import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DashboardNav } from "@/components/DashboardNav";
import { useMyBusiness } from "@/lib/useMyBusiness";

export const Route = createFileRoute("/_authenticated/dashboard/staff")({
  head: () => ({
    meta: [
      { title: "Staff | Fitly Business Platform" },
      { name: "description", content: "Manage staff, their services and weekly availability." },
      { property: "og:title", content: "Staff | Fitly Business Platform" },
      {
        property: "og:description",
        content: "Manage staff, their services and weekly availability.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: StaffPage,
});

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const input =
  "ui-input";

function StaffPage() {
  const qc = useQueryClient();
  const { data: business } = useMyBusiness();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [openStaff, setOpenStaff] = useState<string | null>(null);

  const { data: staff, isLoading } = useQuery({
    queryKey: ["business-staff", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_business_staff", {
        _business_id: business!.id,
      });
      if (e) throw e;
      return data;
    },
  });

  const { data: services } = useQuery({
    queryKey: ["services", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("services")
        .select("id, name, is_active")
        .eq("business_id", business!.id)
        .order("name");
      if (e) throw e;
      return data;
    },
  });

  const linkStaff = useMutation({
    mutationFn: async (value: string) => {
      const { data: found, error: e } = await supabase.rpc("find_user_by_email", {
        _email: value.trim(),
      });
      if (e) throw e;
      const profile = found?.[0];
      if (!profile) throw new Error("No existing account found with that email.");
      const { error: insertError } = await supabase
        .from("staff")
        .insert({ business_id: business!.id, user_id: profile.id });
      if (insertError) throw insertError;
    },
    onSuccess: () => {
      setEmail("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["business-staff"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: { id: string; is_active: boolean }) => {
      const { error: e } = await supabase
        .from("staff")
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (e) throw e;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["business-staff"] }),
    onError: (e: Error) => setError(e.message),
  });

  return (
    <DashboardNav>
      <h1 className="mt-6 text-2xl font-semibold text-foreground">Staff</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          linkStaff.mutate(email);
        }}
        className="ui-card mt-4 flex flex-wrap gap-2 p-5"
      >
        <input
          required
          type="email"
          className={`${input} sm:max-w-xs`}
          placeholder="Existing account email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button
          type="submit"
          disabled={!business || linkStaff.isPending}
          className="ui-btn"
        >
          Link as staff
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

      <div className="mt-6 space-y-3">
        {isLoading && <p className="flex items-center gap-2 text-sm text-muted-foreground"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary border-t-transparent" />Loading...</p>}
        {staff?.length === 0 && <p className="ui-card block p-6 text-center text-sm text-muted-foreground">No staff yet. Add your first team member above.</p>}
        {staff?.map((s) => (
          <div key={s.id} className="ui-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-medium text-foreground">
                  {s.full_name || s.email}{" "}
                  {!s.is_active && <span className="text-muted-foreground">(inactive)</span>}
                </p>
                <p className="text-xs text-muted-foreground">{s.email}</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setOpenStaff(openStaff === s.id ? null : s.id)}
                  className="ui-btn-secondary text-xs"
                >
                  {openStaff === s.id ? "Close" : "Manage"}
                </button>
                <button
                  onClick={() => toggleActive.mutate({ id: s.id, is_active: s.is_active })}
                  className="ui-btn-secondary text-xs"
                >
                  {s.is_active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
            {openStaff === s.id && (
              <div className="mt-4 grid gap-6 sm:grid-cols-2">
                <StaffServices staffId={s.id} services={services ?? []} onError={setError} />
                <StaffAvailability staffId={s.id} onError={setError} />
              </div>
            )}
          </div>
        ))}
      </div>
    </DashboardNav>
  );
}

function StaffServices({
  staffId,
  services,
  onError,
}: {
  staffId: string;
  services: { id: string; name: string; is_active: boolean }[];
  onError: (m: string) => void;
}) {
  const qc = useQueryClient();
  const { data: assigned } = useQuery({
    queryKey: ["staff-services", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_services")
        .select("id, service_id")
        .eq("staff_id", staffId);
      if (error) throw error;
      return data;
    },
  });

  const toggle = useMutation({
    mutationFn: async (serviceId: string) => {
      const existing = assigned?.find((a) => a.service_id === serviceId);
      const { error } = existing
        ? await supabase.from("staff_services").delete().eq("id", existing.id)
        : await supabase.from("staff_services").insert({ staff_id: staffId, service_id: serviceId });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["staff-services", staffId] }),
    onError: (e: Error) => onError(e.message),
  });

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground">Services</h2>
      {services.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground">Create a service first.</p>
      )}
      <ul className="mt-2 space-y-1">
        {services.map((sv) => (
          <li key={sv.id}>
            <label className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={!!assigned?.some((a) => a.service_id === sv.id)}
                onChange={() => toggle.mutate(sv.id)}
              />
              {sv.name}
              {!sv.is_active && <span className="text-xs text-muted-foreground">(inactive)</span>}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StaffAvailability({
  staffId,
  onError,
}: {
  staffId: string;
  onError: (m: string) => void;
}) {
  const qc = useQueryClient();
  const [day, setDay] = useState(1);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("13:00");

  const { data: slots } = useQuery({
    queryKey: ["availability", staffId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability")
        .select("*")
        .eq("staff_id", staffId)
        .order("day_of_week")
        .order("start_time");
      if (error) throw error;
      return data;
    },
  });

  const add = useMutation({
    mutationFn: async () => {
      if (start >= end) throw new Error("Start time must be before end time.");
      const { error } = await supabase
        .from("availability")
        .insert({ staff_id: staffId, day_of_week: day, start_time: start, end_time: end });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability", staffId] }),
    onError: (e: Error) => onError(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("availability").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["availability", staffId] }),
    onError: (e: Error) => onError(e.message),
  });

  return (
    <div>
      <h2 className="text-sm font-medium text-foreground">Weekly availability</h2>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          className={`${input} w-auto`}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
        >
          {DAYS.map((d, i) => (
            <option key={d} value={i}>
              {d}
            </option>
          ))}
        </select>
        <input
          type="time"
          className={`${input} w-auto`}
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
        <input
          type="time"
          className={`${input} w-auto`}
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
        <button
          onClick={() => add.mutate()}
          className="ui-btn-secondary text-xs"
        >
          Add
        </button>
      </div>
      <ul className="mt-2 space-y-1">
        {slots?.map((s) => (
          <li key={s.id} className="flex items-center gap-2 text-sm text-foreground">
            {DAYS[s.day_of_week]} {String(s.start_time).slice(0, 5)}–
            {String(s.end_time).slice(0, 5)}
            <button
              onClick={() => remove.mutate(s.id)}
              className="text-xs text-destructive underline"
            >
              remove
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
