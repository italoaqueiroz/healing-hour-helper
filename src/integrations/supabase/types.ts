export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      appointments: {
        Row: {
          additional_therapist_ids: string[];
          attendance_marked_at: string | null;
          attendance_status: Database["public"]["Enums"]["attendance_status"];
          check_in_at: string | null;
          check_in_by: string | null;
          co_therapist_id: string | null;
          created_at: string;
          ends_at: string;
          event_type: Database["public"]["Enums"]["event_type"];
          google_event_id: string | null;
          id: string;
          notes: string | null;
          patient_id: string | null;
          patient_name: string | null;
          recurrence_group_id: string | null;
          room_id: string;
          starts_at: string;
          therapist_id: string;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          additional_therapist_ids?: string[];
          attendance_marked_at?: string | null;
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
          check_in_at?: string | null;
          check_in_by?: string | null;
          co_therapist_id?: string | null;
          created_at?: string;
          ends_at: string;
          event_type?: Database["public"]["Enums"]["event_type"];
          google_event_id?: string | null;
          id?: string;
          notes?: string | null;
          patient_id?: string | null;
          patient_name?: string | null;
          recurrence_group_id?: string | null;
          room_id: string;
          starts_at: string;
          therapist_id: string;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          additional_therapist_ids?: string[];
          attendance_marked_at?: string | null;
          attendance_status?: Database["public"]["Enums"]["attendance_status"];
          check_in_at?: string | null;
          check_in_by?: string | null;
          co_therapist_id?: string | null;
          created_at?: string;
          ends_at?: string;
          event_type?: Database["public"]["Enums"]["event_type"];
          google_event_id?: string | null;
          id?: string;
          notes?: string | null;
          patient_id?: string | null;
          patient_name?: string | null;
          recurrence_group_id?: string | null;
          room_id?: string;
          starts_at?: string;
          therapist_id?: string;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "appointments_co_therapist_id_fkey";
            columns: ["co_therapist_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_patient_id_fkey";
            columns: ["patient_id"];
            isOneToOne: false;
            referencedRelation: "patients";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "appointments_therapist_id_fkey";
            columns: ["therapist_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      appointment_audit_logs: {
        Row: {
          action: string;
          actor_id: string | null;
          appointment_id: string | null;
          changed_fields: string[];
          created_at: string;
          event_type: string | null;
          id: string;
          new_data: Json | null;
          old_data: Json | null;
          patient_name: string | null;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          appointment_id?: string | null;
          changed_fields?: string[];
          created_at?: string;
          event_type?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          patient_name?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          appointment_id?: string | null;
          changed_fields?: string[];
          created_at?: string;
          event_type?: string | null;
          id?: string;
          new_data?: Json | null;
          old_data?: Json | null;
          patient_name?: string | null;
        };
        Relationships: [{
          foreignKeyName: "appointment_audit_logs_actor_id_fkey";
          columns: ["actor_id"];
          isOneToOne: false;
          referencedRelation: "profiles";
          referencedColumns: ["id"];
        }];
      };
      notifications: {
        Row: {
          appointment_id: string | null;
          created_at: string;
          id: string;
          kind: string;
          message: string;
          read_at: string | null;
          recipient_id: string;
          title: string;
        };
        Insert: {
          appointment_id?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          message: string;
          read_at?: string | null;
          recipient_id: string;
          title: string;
        };
        Update: {
          appointment_id?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          message?: string;
          read_at?: string | null;
          recipient_id?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_appointment_id_fkey";
            columns: ["appointment_id"];
            isOneToOne: false;
            referencedRelation: "appointments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      patients: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          parent_email: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          phone: string | null;
          registration_number: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          phone?: string | null;
          registration_number?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          phone?: string | null;
          registration_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pro_infancia_children: {
        Row: {
          active: boolean;
          birth_date: string | null;
          created_at: string;
          created_by: string | null;
          diagnosis: string | null;
          full_name: string;
          goals: string | null;
          id: string;
          notes: string | null;
          parent_email: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          school: string | null;
          updated_at: string;
        };
        Insert: {
          active?: boolean;
          birth_date?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: string | null;
          full_name: string;
          goals?: string | null;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          school?: string | null;
          updated_at?: string;
        };
        Update: {
          active?: boolean;
          birth_date?: string | null;
          created_at?: string;
          created_by?: string | null;
          diagnosis?: string | null;
          full_name?: string;
          goals?: string | null;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          school?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pro_infancia_contacts: {
        Row: {
          created_at: string;
          created_by: string | null;
          email: string | null;
          full_name: string;
          id: string;
          notes: string | null;
          parent_email: string | null;
          parent_name: string | null;
          parent_phone: string | null;
          phone: string | null;
          registration_number: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name: string;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          phone?: string | null;
          registration_number?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          email?: string | null;
          full_name?: string;
          id?: string;
          notes?: string | null;
          parent_email?: string | null;
          parent_name?: string | null;
          parent_phone?: string | null;
          phone?: string | null;
          registration_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      pro_infancia_notes: {
        Row: {
          child_id: string;
          content: string;
          created_at: string;
          id: string;
          session_date: string;
          therapist_id: string | null;
          updated_at: string;
        };
        Insert: {
          child_id: string;
          content: string;
          created_at?: string;
          id?: string;
          session_date?: string;
          therapist_id?: string | null;
          updated_at?: string;
        };
        Update: {
          child_id?: string;
          content?: string;
          created_at?: string;
          id?: string;
          session_date?: string;
          therapist_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "pro_infancia_notes_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "pro_infancia_children";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          approved: boolean;
          approved_at: string | null;
          approved_by: string | null;
          color: string | null;
          created_at: string;
          default_session_minutes: number;
          email: string | null;
          full_name: string | null;
          id: string;
          session_duration_selected_at: string | null;
          tutorial_completed_at: string | null;
          tutorial_step: number;
        };
        Insert: {
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          color?: string | null;
          created_at?: string;
          default_session_minutes?: number;
          email?: string | null;
          full_name?: string | null;
          id: string;
          session_duration_selected_at?: string | null;
          tutorial_completed_at?: string | null;
          tutorial_step?: number;
        };
        Update: {
          approved?: boolean;
          approved_at?: string | null;
          approved_by?: string | null;
          color?: string | null;
          created_at?: string;
          default_session_minutes?: number;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          session_duration_selected_at?: string | null;
          tutorial_completed_at?: string | null;
          tutorial_step?: number;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          updated_at: string;
          user_agent: string | null;
          user_id: string;
        };
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          id: string;
          name: string;
          position: number;
        };
        Insert: {
          id?: string;
          name: string;
          position: number;
        };
        Update: {
          id?: string;
          name?: string;
          position?: number;
        };
        Relationships: [];
      };
      therapist_unavailability: {
        Row: {
          created_at: string;
          created_by: string | null;
          ends_at: string;
          id: string;
          kind: string;
          reason: string | null;
          starts_at: string;
          therapist_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          ends_at: string;
          id?: string;
          kind?: string;
          reason?: string | null;
          starts_at: string;
          therapist_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          ends_at?: string;
          id?: string;
          kind?: string;
          reason?: string | null;
          starts_at?: string;
          therapist_id?: string;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      advance_tutorial: { Args: never; Returns: Database["public"]["Tables"]["profiles"]["Row"] };
      auto_mark_present: { Args: never; Returns: undefined };
      claim_admin: { Args: never; Returns: boolean };
      complete_duration_setup: {
        Args: { _minutes: number };
        Returns: Database["public"]["Tables"]["profiles"]["Row"];
      };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_staff: { Args: { _user_id: string }; Returns: boolean };
    };
    Enums: {
      app_role: "admin" | "therapist" | "pro_infancia";
      attendance_status:
        | "pending"
        | "present"
        | "absent"
        | "rescheduled"
        | "cancelled"
        | "absent_therapist"
        | "absent_unjustified"
        | "absent_justified";
      event_type: "session" | "meeting" | "online" | "block" | "vacation" | "other";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "therapist", "pro_infancia"],
      attendance_status: [
        "pending",
        "present",
        "absent",
        "rescheduled",
        "cancelled",
        "absent_therapist",
        "absent_unjustified",
        "absent_justified",
      ],
      event_type: ["session", "meeting", "online", "block", "vacation", "other"],
    },
  },
} as const;
