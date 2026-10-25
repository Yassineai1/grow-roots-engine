export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          staff_id: string
          start_time: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          staff_id: string
          start_time: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          staff_id?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          booking_date: string
          business_id: string
          client_id: string
          created_at: string
          end_time: string
          hold_expires_at: string | null
          id: string
          notes: string | null
          reminder_sent: boolean
          service_id: string
          staff_id: string
          start_time: string
          status: string
        }
        Insert: {
          booking_date: string
          business_id: string
          client_id: string
          created_at?: string
          end_time: string
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          reminder_sent?: boolean
          service_id: string
          staff_id: string
          start_time: string
          status?: string
        }
        Update: {
          booking_date?: string
          business_id?: string
          client_id?: string
          created_at?: string
          end_time?: string
          hold_expires_at?: string | null
          id?: string
          notes?: string | null
          reminder_sent?: boolean
          service_id?: string
          staff_id?: string
          start_time?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          accent_color: string | null
          brand_color: string | null
          business_type: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          id: string
          language_default: string
          logo_url: string | null
          name: string
          owner_id: string
          phone: string | null
          settings: Json
          slug: string
          subscription_status: string
          whatsapp: string | null
        }
        Insert: {
          accent_color?: string | null
          brand_color?: string | null
          business_type: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          language_default?: string
          logo_url?: string | null
          name: string
          owner_id: string
          phone?: string | null
          settings?: Json
          slug: string
          subscription_status?: string
          whatsapp?: string | null
        }
        Update: {
          accent_color?: string | null
          brand_color?: string | null
          business_type?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          language_default?: string
          logo_url?: string | null
          name?: string
          owner_id?: string
          phone?: string | null
          settings?: Json
          slug?: string
          subscription_status?: string
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          business_id: string
          created_at: string
          id: string
          notes: string | null
          user_id: string | null
        }
        Insert: {
          business_id: string
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Update: {
          business_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_outbox: {
        Row: {
          attempts: number
          booking_id: string
          business_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          payload: Json
          recipient_email: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          attempts?: number
          booking_id: string
          business_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient_email: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          attempts?: number
          booking_id?: string
          business_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          payload?: Json
          recipient_email?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_outbox_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_outbox_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          booking_id: string | null
          business_id: string
          client_id: string
          created_at: string
          currency: string
          id: string
          provider: string
          provider_payment_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          business_id: string
          client_id: string
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          business_id?: string
          client_id?: string
          created_at?: string
          currency?: string
          id?: string
          provider?: string
          provider_payment_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          business_id: string
          capacity: number
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          is_active: boolean
          name: string
          price: number
          requires_payment: boolean
          service_type: string
        }
        Insert: {
          business_id: string
          capacity?: number
          created_at?: string
          description?: string | null
          duration_minutes: number
          id?: string
          is_active?: boolean
          name: string
          price?: number
          requires_payment?: boolean
          service_type: string
        }
        Update: {
          business_id?: string
          capacity?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          is_active?: boolean
          name?: string
          price?: number
          requires_payment?: boolean
          service_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          bio: string | null
          business_id: string
          created_at: string
          id: string
          is_active: boolean
          specialties: string[] | null
          user_id: string
        }
        Insert: {
          bio?: string | null
          business_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          specialties?: string[] | null
          user_id: string
        }
        Update: {
          bio?: string | null
          business_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          specialties?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_services: {
        Row: {
          created_at: string
          id: string
          service_id: string
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: string
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_services_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_services_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          preferred_language: string
          role: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          phone?: string | null
          preferred_language?: string
          role?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          preferred_language?: string
          role?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cancel_own_booking: {
        Args: { _booking_id: string }
        Returns: {
          payment_status: string
          status: string
        }[]
      }
      clear_business_payment_config: {
        Args: { _business_id: string }
        Returns: undefined
      }
      find_user_by_email: {
        Args: { _email: string }
        Returns: {
          full_name: string
          id: string
        }[]
      }
      get_available_slots: {
        Args: { _date: string; _service_id: string }
        Returns: {
          end_time: string
          staff_id: string
          staff_name: string
          start_time: string
        }[]
      }
      get_business_bookings: {
        Args: { _business_id: string }
        Returns: {
          booking_date: string
          client_email: string
          client_name: string
          end_time: string
          id: string
          notes: string
          payment_amount: number
          payment_currency: string
          payment_status: string
          requires_payment: boolean
          service_name: string
          staff_name: string
          start_time: string
          status: string
        }[]
      }
      get_business_client: {
        Args: { _client_id: string }
        Returns: {
          booking_count: number
          business_id: string
          created_at: string
          email: string
          full_name: string
          id: string
          notes: string
          phone: string
        }[]
      }
      get_business_client_bookings: {
        Args: { _client_id: string }
        Returns: {
          booking_date: string
          end_time: string
          id: string
          notes: string
          payment_amount: number
          payment_currency: string
          payment_status: string
          service_name: string
          staff_name: string
          start_time: string
          status: string
        }[]
      }
      get_business_clients: {
        Args: { _business_id: string; _q?: string }
        Returns: {
          booking_count: number
          email: string
          full_name: string
          id: string
          last_booking_date: string
          next_booking_date: string
          notes: string
          phone: string
          status: string
          user_id: string
        }[]
      }
      get_business_payment_secrets: {
        Args: { _business_id: string }
        Returns: {
          merchant_id: string
          mode: string
          payment_configured: boolean
          provider: string
          store_key: string
        }[]
      }
      get_business_staff: {
        Args: { _business_id: string }
        Returns: {
          bio: string
          email: string
          full_name: string
          id: string
          is_active: boolean
          specialties: string[]
          user_id: string
        }[]
      }
      get_my_bookings: {
        Args: never
        Returns: {
          booking_date: string
          business_name: string
          can_cancel: boolean
          end_time: string
          id: string
          payment_amount: number
          payment_currency: string
          payment_status: string
          service_name: string
          staff_name: string
          start_time: string
          status: string
        }[]
      }
      get_payment_settings: {
        Args: { _business_id: string }
        Returns: {
          merchant_id_masked: string
          mode: string
          payment_configured: boolean
          provider: string
        }[]
      }
      get_public_business: {
        Args: { _slug: string }
        Returns: {
          accent_color: string
          brand_color: string
          business_type: string
          cover_image_url: string
          description: string
          id: string
          logo_url: string
          name: string
          phone: string
          slug: string
          whatsapp: string
        }[]
      }
      get_public_payment_availability: {
        Args: { _business_id: string }
        Returns: {
          payment_configured: boolean
          provider: string
        }[]
      }
      get_public_services: {
        Args: { _business_id: string }
        Returns: {
          capacity: number
          description: string
          duration_minutes: number
          id: string
          name: string
          price: number
          requires_payment: boolean
          service_type: string
        }[]
      }
      queue_booking_reminders: { Args: never; Returns: number }
      search_public_businesses: {
        Args: { _q: string }
        Returns: {
          business_type: string
          logo_url: string
          name: string
          slug: string
        }[]
      }
      set_business_payment_config: {
        Args: {
          _business_id: string
          _merchant_id: string
          _mode: string
          _store_key: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
