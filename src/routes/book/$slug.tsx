import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  startBookingCheckout,
  resolveMockPayment,
  cancelBookingCheckout,
} from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/payments/types";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

export const Route = createFileRoute("/book/$slug")({
  component: PublicBookingPage,
});

const STORAGE_KEY = "pending_booking";

function formatLocalTime(timeStr: string, timezone: string): string {
  try {
    const [hours = '00', minutes = '00'] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: timezone,
    }).format(date);
  } catch {
    return timeStr.slice(0, 5);
  }
}

function PublicBookingPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [business, setBusiness] = useState<any>(null);
  const [services, setServices] = useState<any[]>([]);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableDays, setAvailableDays] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<any | null>(null);
  const [confirmation, setConfirmation] = useState<any | null>(null);

  const startCheckout = useServerFn(startBookingCheckout);
  const resolvePayment = useServerFn(resolveMockPayment);
  const cancelCheckout = useServerFn(cancelBookingCheckout);

  // 1. Fetch Business & Services
  useEffect(() => {
    async function loadData() {
      const { data: bData } = await supabase.rpc("get_public_business", { _slug: slug });
      if (!bData || bData.length === 0) { setIsLoading(false); return; }
      const biz = bData[0] as any;
      setBusiness(biz);

      const { data: sData } = await supabase.rpc("get_public_services", { _business_id: biz.id });
      setServices(sData || []);
      setIsLoading(false);
    }
    loadData();
  }, [slug]);

  // 2. Fetch Available Days when service changes
  useEffect(() => {
    async function fetchDays() {
      if (!selectedService) return;
      setAvailableDays([]);
      const today = new Date();
      const start = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
      const end = new Date(today.getFullYear(), today.getMonth() + 2, 0).toISOString().split('T')[0];
      
      const { data } = await supabase.rpc("get_available_days" as any, {
        _service_id: selectedService,
        _month_start: start,
        _month_end: end
      });
      if (data) setAvailableDays(data.map((d: any) => d.available_date));
    }
    fetchDays();
  }, [selectedService]);

  // 3. Fetch Slots when date changes
  useEffect(() => {
    async function fetchSlots() {
      if (!selectedService || !selectedDate) return;
      setIsLoadingSlots(true);
      setAvailableSlots([]);
      setSelectedSlot(null);
      
      const { data, error } = await supabase.rpc("get_available_slots", {
        _service_id: selectedService,
        _date: selectedDate
      });
      if (!error && data) setAvailableSlots(data);
      setIsLoadingSlots(false);
    }
    fetchSlots();
  }, [selectedService, selectedDate]);

  // 4. Handle Booking
  async function handleBook() {
    if (!selectedService || !selectedSlot || !selectedDate || !business) return;
    const currentBusiness = business; // TS narrow
    setBusy(true);
    setError(null);

    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          serviceId: selectedService, staffId: selectedSlot.staff_id,
          date: selectedDate, startTime: selectedSlot.start_time, endTime: selectedSlot.end_time
        }));
        navigate({ to: "/login", search: { redirect: `/book/${slug}` } });
        return;
      }

      const service = services.find(s => s.id === selectedService);
      
      if (service?.requires_payment) {
        const res = await startCheckout({
          data: {
            businessId: currentBusiness.id, serviceId: selectedService, staffId: selectedSlot.staff_id,
            date: selectedDate, startTime: selectedSlot.start_time, endTime: selectedSlot.end_time,
          },
        });
        
        if (res.status === "unavailable") {
          setError("Online payment is not available. Please contact the business.");
          return;
        }
        
        setCheckout({
          paymentId: res.paymentId, bookingId: res.bookingId, amount: res.amount, currency: res.currency,
          mode: res.mode, service: service.name, staff: selectedSlot.staff_name,
          date: selectedDate, time: `${formatLocalTime(selectedSlot.start_time, business.timezone)}–${formatLocalTime(selectedSlot.end_time, business.timezone)}`,
          serviceId: selectedService, staffId: selectedSlot.staff_id, startTime: selectedSlot.start_time, endTime: selectedSlot.end_time,
        });
        return;
      }

      // Free Booking
      await supabase.from("users").upsert({ id: userData.user.id, email: userData.user.email ?? "", full_name: "Client" }, { onConflict: "id", ignoreDuplicates: true });
      
      const { data: client } = await supabase.from("clients").select("id").eq("business_id", currentBusiness.id).eq("user_id", userData.user.id).maybeSingle();
      let clientId = client?.id as string | undefined;
      if (!clientId) {
        const { data: newClient } = await supabase.from("clients").insert({ business_id: currentBusiness.id, user_id: userData.user.id }).select("id").single();
        clientId = newClient?.id;
      }

      const { error: bookError } = await supabase.from("bookings").insert({
        business_id: currentBusiness.id, client_id: clientId as string, service_id: selectedService, staff_id: selectedSlot.staff_id,
        booking_date: selectedDate, start_time: selectedSlot.start_time, end_time: selectedSlot.end_time, status: 'confirmed'
      });

      if (bookError) throw bookError;

      setConfirmation({
        service: service?.name, staff: selectedSlot.staff_name, date: selectedDate,
        time: `${formatLocalTime(selectedSlot.start_time, currentBusiness.timezone)}–${formatLocalTime(selectedSlot.end_time, currentBusiness.timezone)}`, status: "confirmed"
      });
      setSelectedService(null); setSelectedSlot(null); setSelectedDate("");

    } catch (err: any) {
      setError(err.message || "Failed to book.");
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) return <div className="p-10 text-center text-foreground">Loading...</div>;
  if (!business) return <div className="p-10 text-center text-destructive">Business not found.</div>;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 sm:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold">{business.name}</h1>
          <p className="text-muted-foreground">{business.description || "Book your next session with us."}</p>
        </div>

        {/* Success State */}
        {confirmation && (
          <div className="ui-card p-6 border-success text-center space-y-4">
            <h2 className="text-2xl font-bold text-success">Booking Confirmed! 🎉</h2>
            <p>{confirmation.service} with {confirmation.staff}</p>
            <p className="font-mono">{confirmation.date} at {confirmation.time}</p>
            <button onClick={() => setConfirmation(null)} className="ui-btn mt-4">Book another</button>
          </div>
        )}

        {/* Checkout State */}
        {checkout && !confirmation && (
          <div className="ui-card p-6 space-y-4">
            <h2 className="text-xl font-bold">Payment Required</h2>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>Service: {checkout.service}</p>
              <p>Time: {checkout.date} at {checkout.time}</p>
              <p className="text-lg font-bold text-foreground mt-2">{formatMoney(checkout.amount, checkout.currency)}</p>
            </div>
            
            {checkout.mode === "test" ? (
              <div className="space-y-3 pt-4 border-t border-border">
                <p className="text-xs text-warning">Test Mode: Click below to simulate payment.</p>
                <button 
                  onClick={async () => {
                    setBusy(true);
                    await resolvePayment({ data: { paymentId: checkout.paymentId, outcome: "success" } });
                    setCheckout(null);
                    setConfirmation({ ...checkout, status: "paid" });
                    setBusy(false);
                  }} 
                  disabled={busy} 
                  className="ui-btn w-full"
                >
                  Simulate Successful Payment
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-4 border-t border-border">
                <p className="text-sm">You will be redirected to Stripe to pay securely.</p>
                <button 
                  onClick={async () => {
                    setBusy(true);
                    const res = await startCheckout({ data: { businessId: business.id, serviceId: checkout.serviceId, staffId: checkout.staffId, date: checkout.date, startTime: checkout.startTime, endTime: checkout.endTime } });
                    if (res.status === "checkout" && res.redirectUrl) window.location.href = res.redirectUrl;
                    setBusy(false);
                  }} 
                  disabled={busy} 
                  className="ui-btn w-full"
                >
                  Pay with Stripe
                </button>
              </div>
            )}
            <button onClick={() => setCheckout(null)} className="ui-btn-secondary w-full mt-2">Cancel</button>
          </div>
        )}

        {/* Booking Flow */}
        {!confirmation && !checkout && (
          <div className="space-y-8">
            {/* Services */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold">Select a Service</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {services.map(s => (
                  <button 
                    key={s.id} 
                    onClick={() => { setSelectedService(s.id); setSelectedDate(""); setSelectedSlot(null); }}
                    className={`ui-card p-4 text-left transition ${selectedService === s.id ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/50'}`}
                  >
                    <div className="font-bold">{s.name}</div>
                    <div className="text-sm text-muted-foreground">{s.duration_minutes} min</div>
                    <div className="mt-2 font-mono">{formatMoney(s.price, "MAD")}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Calendar */}
            {selectedService && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Select a Date</h2>
                <div className="ui-card p-4 inline-block">
                  <DayPicker
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate) : undefined}
                    onSelect={(d) => {
                      if (d) {
                        const offset = d.getTimezoneOffset();
                        setSelectedDate(new Date(d.getTime() - (offset*60000)).toISOString().split('T')[0] as string);
                      } else setSelectedDate("");
                    }}
                    disabled={[
                      { before: new Date() },
                      (d) => {
                        const offset = d.getTimezoneOffset();
                        const dateStr = new Date(d.getTime() - (offset*60000)).toISOString().split('T')[0] as string;
                        return !availableDays.includes(dateStr);
                      }
                    ]}
                    modifiersClassNames={{ selected: 'bg-primary text-primary-foreground font-bold rounded-md' }}
                  />
                </div>
              </div>
            )}

            {/* Slots */}
            {selectedDate && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold">Select a Time</h2>
                {isLoadingSlots ? (
                  <p className="text-muted-foreground">Loading times...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-muted-foreground">No times available on this date.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
                    {availableSlots.map((slot, i) => (
                      <button
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={`ui-card p-3 text-center transition ${selectedSlot?.start_time === slot.start_time ? 'border-primary bg-primary/10' : 'hover:border-primary/50'}`}
                      >
                        <div className="font-bold">{slot.start_time.slice(0,5)}</div>
                        <div className="text-xs text-muted-foreground">{slot.staff_name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Confirm Button */}
            {selectedSlot && (
              <div className="pt-4 border-t border-border">
                <button onClick={handleBook} disabled={busy} className="ui-btn w-full text-lg py-3">
                  {busy ? "Processing..." : "Confirm Booking"}
                </button>
                {error && <p className="text-destructive text-sm mt-2 text-center">{error}</p>}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}
