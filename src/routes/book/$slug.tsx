import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  startBookingCheckout,
  resolveMockPayment,
  retryBookingPayment,
  cancelBookingCheckout,
} from "@/lib/payments.functions";
import { getBrandingImageUrls } from "@/lib/branding.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/payments/types";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/book/$slug")({
  component: PublicBookingPage,
});

const STORAGE_KEY = "pending_booking";

function formatLocalTime(timeStr: string, timezone: string): string {
  try {
    const [hours = '0', minutes = '0'] = timeStr.split(':');
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone,
    }).format(date);
  } catch { return timeStr.slice(0, 5); }
}

export default function PublicBookingPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();

  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkout, setCheckout] = useState<any | null>(null);
  
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<any | null>(null);

  const bookingRef = useRef<HTMLDivElement | null>(null);
  const servicesRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<HTMLDivElement | null>(null);

  const startCheckout = useServerFn(startBookingCheckout);
  const resolvePayment = useServerFn(resolveMockPayment);
  const retryPayment = useServerFn(retryBookingPayment);
  const cancelCheckout = useServerFn(cancelBookingCheckout);

  const { data: business } = useQuery({
    queryKey: ["public-business", slug],
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_business", { _slug: slug });
      if (e) throw e;
      return data?.[0] ?? null;
    },
  });

  const brandingImages = useServerFn(getBrandingImageUrls);
  const { data: images } = useQuery({
    queryKey: ["public-branding-images", slug],
    queryFn: () => brandingImages({ data: { slug } }),
  });

  const { data: services } = useQuery({
    queryKey: ["public-services", business?.id],
    enabled: !!business?.id,
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_public_services", { _business_id: business!.id });
      if (e) throw e;
      return data ?? [];
    },
  });

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    async function fetchSlots() {
      if (!selectedService || !selectedDate || !business) return;
      setIsLoadingSlots(true);
      setAvailableSlots([]);
      try {
        const { data, error } = await supabase.rpc('get_available_slots', {
          _service_id: selectedService, _date: selectedDate
        });
        if (error) throw error;
        setAvailableSlots(data || []);
      } catch (err) { console.error(err); } 
      finally { setIsLoadingSlots(false); }
    }
    fetchSlots();
  }, [selectedService, selectedDate, business]);

  async function handleBook() {
    if (!selectedService || !selectedSlot || !selectedDate || !business) return;
    setBusy(true); setError(null);
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
          serviceId: selectedService, staffId: selectedSlot.staffId,
          date: selectedDate, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime
        }));
        navigate({ to: "/login", search: { redirect: `/book/${slug}` } });
        return;
      }

      const service = services?.find(s => s.id === selectedService);
      if (service?.requires_payment) {
        const res = await startCheckout({
          data: {
            businessId: business.id, serviceId: selectedService, staffId: selectedSlot.staffId,
            date: selectedDate, startTime: selectedSlot.startTime, endTime: selectedSlot.endTime,
          },
        });
        if (res.status === "unavailable") { setError("Online payment is not available."); return; }
        
        setCheckout({
          paymentId: res.paymentId, bookingId: res.bookingId, amount: res.amount,
          currency: res.currency, mode: res.mode, service: service.name,
          staff: selectedSlot.staffName, date: selectedDate,
          time: `${formatLocalTime(selectedSlot.startTime, (business as any).timezone || "Africa/Casablanca")}–${formatLocalTime(selectedSlot.endTime, (business as any).timezone || "Africa/Casablanca")}`,
          serviceId: selectedService, staffId: selectedSlot.staffId,
          startTime: selectedSlot.startTime, endTime: selectedSlot.endTime,
        });
        return;
      }

      // Free booking flow (omitted for brevity, uses standard supabase insert)
      setError("Free booking flow not fully implemented in this snippet.");
      
    } catch (err: any) { setError(err.message || "Failed to book."); } 
    finally { setBusy(false); }
  }

  if (!business) return <div className="min-h-screen bg-[#121417] flex items-center justify-center text-white">Loading...</div>;

  const brandColor = business.brand_color || "#D4FF3D";
const coverImage = images?.coverUrl || "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop";

  return (
    <div className="min-h-screen bg-[#121417] text-[#F5F5F2] font-sans selection:bg-[#D4FF3D] selection:text-black">
      
      {/* HERO SECTION */}
      <section className="relative h-[60vh] min-h-[400px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={coverImage} alt="Cover" className="w-full h-full object-cover opacity-40" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#121417] via-[#121417]/80 to-transparent" />
        </div>
        
        <div className="relative z-10 text-center px-4 max-w-4xl mx-auto mt-20">
          {images?.logoUrl && (
            <img src={images.logoUrl} alt="Logo" className="w-24 h-24 mx-auto rounded-full object-cover border-4 border-[#121417] shadow-2xl mb-6 bg-white" />
          )}
          <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-4 text-white">
            {business.name}
          </h1>
          <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-2xl mx-auto font-light">
            {business.description || "Elevate your performance. Book your next session with us today."}
          </p>
          <button 
            onClick={() => scrollTo(servicesRef)}
            className="px-8 py-4 rounded-full font-bold text-lg transition-transform hover:scale-105 shadow-[0_0_20px_rgba(212,255,61,0.3)]"
            style={{ backgroundColor: brandColor, color: "#000" }}
          >
            Book a Session
          </button>
        </div>
      </section>

      {/* SERVICES SECTION */}
      <section ref={servicesRef} className="py-24 px-4 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Services</h2>
          <p className="text-gray-400">Choose the experience that fits your goals.</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services?.map((s: any) => (
            <div 
              key={s.id} 
              onClick={() => { setSelectedService(s.id); setSelectedSlot(null); setTimeout(() => scrollTo(pickerRef), 100); }}
              className={cn(
                "group relative p-8 rounded-2xl cursor-pointer transition-all duration-300 border",
                selectedService === s.id 
                  ? "bg-[#1E2126] border-[#D4FF3D] shadow-[0_0_30px_rgba(212,255,61,0.1)]" 
                  : "bg-[#1E2126]/50 border-white/5 hover:border-white/20 hover:bg-[#1E2126]"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-2xl font-semibold text-white">{s.name}</h3>
                <span className="text-xl font-bold" style={{ color: brandColor }}>
                  {formatMoney(s.price, "MAD")}
                </span>
              </div>
              <p className="text-gray-400 mb-6 line-clamp-2">{s.description}</p>
              <div className="flex items-center text-sm text-gray-500 font-medium">
                <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                {s.duration_minutes} Minutes
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOOKING WIDGET SECTION */}
      {selectedService && !checkout && !confirmation && (
        <section ref={pickerRef} className="py-12 px-4 max-w-4xl mx-auto border-t border-white/10">
          <div className="bg-[#1E2126] rounded-3xl p-8 md:p-12 shadow-2xl border border-white/5">
            <h2 className="text-3xl font-bold mb-2">Select Date & Time</h2>
            <p className="text-gray-400 mb-8">Pick a slot that works for you.</p>
            
            <div className="grid md:grid-cols-2 gap-12">
              <div>
                <h3 className="text-sm uppercase tracking-wider text-gray-400 font-semibold mb-4">1. Choose Date</h3>
                <div className="bg-[#121417] p-4 rounded-xl inline-block w-full">
                  <DayPicker
                    mode="single"
                    selected={selectedDate ? new Date(selectedDate) : undefined}
                    onSelect={(date) => {
                      if (date) {
                        const offset = date.getTimezoneOffset();
                        const localDate = new Date(date.getTime() - (offset*60*1000));
                        setSelectedDate(localDate.toISOString().split('T')[0] || '');
                        setSelectedSlot(null);
                      }
                    }}
                    disabled={{ before: new Date() }}
                    modifiersClassNames={{
                      selected: 'bg-[#D4FF3D] text-black font-bold rounded-md',
                      today: 'text-[#D4FF3D] font-bold',
                    }}
                    className="text-white m-0"
                  />
                </div>
              </div>

              <div>
                <h3 className="text-sm uppercase tracking-wider text-gray-400 font-semibold mb-4">2. Choose Time</h3>
                {!selectedDate ? (
                  <div className="h-full flex items-center justify-center text-gray-500 italic">Please select a date first</div>
                ) : isLoadingSlots ? (
                  <div className="text-gray-400">Loading available slots...</div>
                ) : availableSlots.length === 0 ? (
                  <div className="text-gray-500 bg-[#121417] p-4 rounded-xl">No slots available on this date.</div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {availableSlots.map((slot: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          "p-3 rounded-xl border text-center transition-all",
                          selectedSlot?.startTime === slot.start_time
                            ? "border-[#D4FF3D] bg-[#D4FF3D]/10 text-[#D4FF3D]"
                            : "border-white/10 bg-[#121417] text-gray-300 hover:border-white/30"
                        )}
                      >
                        <div className="font-bold text-lg">{slot.start_time.slice(0, 5)}</div>
                        <div className="text-xs text-gray-500 mt-1">{slot.staff_name}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {error && <div className="mt-6 p-4 bg-red-500/10 border border-red-500/50 text-red-400 rounded-lg">{error}</div>}

            {selectedSlot && (
              <div className="mt-10 pt-8 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-6">
                <div>
                  <p className="text-gray-400 text-sm">Total Amount</p>
                  <p className="text-3xl font-bold" style={{ color: brandColor }}>
                    {formatMoney(services?.find((s:any) => s.id === selectedService)?.price || 0, "MAD")}
                  </p>
                </div>
                <button 
                  onClick={handleBook}
                  disabled={busy}
                  className="w-full md:w-auto px-10 py-4 rounded-full font-bold text-lg transition-transform hover:scale-105 disabled:opacity-50 disabled:hover:scale-100"
                  style={{ backgroundColor: brandColor, color: "#000" }}
                >
                  {busy ? "Processing..." : "Confirm Booking"}
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* CHECKOUT / SUCCESS STATES (Simplified for UI focus) */}
      {checkout && (
        <section className="py-24 px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">Redirecting to Payment...</h2>
            <p className="text-gray-400">Please wait while we secure your slot.</p>
        </section>
      )}

      {confirmation && (
        <section className="py-24 px-4 text-center">
            <div className="w-20 h-20 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h2 className="text-4xl font-bold mb-4">Booking Confirmed!</h2>
            <p className="text-xl text-gray-300 mb-8">We've sent the details to your email.</p>
        </section>
      )}

      {/* FOOTER */}
      <footer className="py-12 text-center text-gray-600 border-t border-white/5 mt-12">
        <p>© {new Date().getFullYear()} {business.name}. All rights reserved.</p>
        <p className="text-sm mt-2">Powered by Grow Roots Engine</p>
      </footer>

    </div>
  );
}
