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
      device_commands: {
        Row: {
          command: string
          created_at: string
          device_id: string
          executed_at: string | null
          id: string
          issued_by: string | null
          result: string | null
          status: string
          target: string | null
        }
        Insert: {
          command: string
          created_at?: string
          device_id: string
          executed_at?: string | null
          id?: string
          issued_by?: string | null
          result?: string | null
          status?: string
          target?: string | null
        }
        Update: {
          command?: string
          created_at?: string
          device_id?: string
          executed_at?: string | null
          id?: string
          issued_by?: string | null
          result?: string | null
          status?: string
          target?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_commands_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_events: {
        Row: {
          created_at: string
          device_id: string
          id: number
          level: string
          message: string
          source: string | null
        }
        Insert: {
          created_at?: string
          device_id: string
          id?: number
          level?: string
          message: string
          source?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string
          id?: number
          level?: string
          message?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "device_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          agent_token: string
          agent_version: string | null
          created_at: string
          id: string
          last_seen_at: string | null
          name: string
          online: boolean
          os: string | null
          paired: boolean
          pairing_code: string
          shutdown_when_finished: boolean
          thermal_limit_c: number
          user_id: string
        }
        Insert: {
          agent_token?: string
          agent_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name: string
          online?: boolean
          os?: string | null
          paired?: boolean
          pairing_code?: string
          shutdown_when_finished?: boolean
          thermal_limit_c?: number
          user_id: string
        }
        Update: {
          agent_token?: string
          agent_version?: string | null
          created_at?: string
          id?: string
          last_seen_at?: string | null
          name?: string
          online?: boolean
          os?: string | null
          paired?: boolean
          pairing_code?: string
          shutdown_when_finished?: boolean
          thermal_limit_c?: number
          user_id?: string
        }
        Relationships: []
      }
      notification_channels: {
        Row: {
          created_at: string
          enabled: boolean
          id: string
          kind: string
          user_id: string
          webhook_url: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind: string
          user_id: string
          webhook_url: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          id?: string
          kind?: string
          user_id?: string
          webhook_url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          current_frame: number
          device_id: string
          engine: string
          eta_seconds: number | null
          external_id: string | null
          id: string
          progress: number
          project_name: string
          samples_done: number | null
          samples_total: number | null
          started_at: string
          status: string
          total_frames: number | null
          updated_at: string
        }
        Insert: {
          current_frame?: number
          device_id: string
          engine: string
          eta_seconds?: number | null
          external_id?: string | null
          id?: string
          progress?: number
          project_name: string
          samples_done?: number | null
          samples_total?: number | null
          started_at?: string
          status?: string
          total_frames?: number | null
          updated_at?: string
        }
        Update: {
          current_frame?: number
          device_id?: string
          engine?: string
          eta_seconds?: number | null
          external_id?: string | null
          id?: string
          progress?: number
          project_name?: string
          samples_done?: number | null
          samples_total?: number | null
          started_at?: string
          status?: string
          total_frames?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      telemetry_samples: {
        Row: {
          cpu_load_pct: number | null
          cpu_temp_c: number | null
          created_at: string
          device_id: string
          gpu_fan_pct: number | null
          gpu_load_pct: number | null
          gpu_power_w: number | null
          gpu_temp_c: number | null
          id: number
          power_draw_w: number | null
          ram_total_gb: number | null
          ram_used_gb: number | null
          vram_total_mb: number | null
          vram_used_mb: number | null
        }
        Insert: {
          cpu_load_pct?: number | null
          cpu_temp_c?: number | null
          created_at?: string
          device_id: string
          gpu_fan_pct?: number | null
          gpu_load_pct?: number | null
          gpu_power_w?: number | null
          gpu_temp_c?: number | null
          id?: number
          power_draw_w?: number | null
          ram_total_gb?: number | null
          ram_used_gb?: number | null
          vram_total_mb?: number | null
          vram_used_mb?: number | null
        }
        Update: {
          cpu_load_pct?: number | null
          cpu_temp_c?: number | null
          created_at?: string
          device_id?: string
          gpu_fan_pct?: number | null
          gpu_load_pct?: number | null
          gpu_power_w?: number | null
          gpu_temp_c?: number | null
          id?: number
          power_draw_w?: number | null
          ram_total_gb?: number | null
          ram_used_gb?: number | null
          vram_total_mb?: number | null
          vram_used_mb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "telemetry_samples_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      owns_device: { Args: { _device_id: string }; Returns: boolean }
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
