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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      content_items: {
        Row: {
          approved_revision_id: string | null
          archived_at: string | null
          draft_revision_id: string | null
          id: string
          kind: string
          owner_id: string | null
          review_state: string
          stable_id: string
          updated_at: string
          version: number
        }
        Insert: {
          approved_revision_id?: string | null
          archived_at?: string | null
          draft_revision_id?: string | null
          id?: string
          kind: string
          owner_id?: string | null
          review_state?: string
          stable_id: string
          updated_at?: string
          version?: number
        }
        Update: {
          approved_revision_id?: string | null
          archived_at?: string | null
          draft_revision_id?: string | null
          id?: string
          kind?: string
          owner_id?: string | null
          review_state?: string
          stable_id?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_belongs_to_item"
            columns: ["id", "approved_revision_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["item_id", "id"]
          },
          {
            foreignKeyName: "draft_belongs_to_item"
            columns: ["id", "draft_revision_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["item_id", "id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          item_id: string
          payload: Json
          schema_version: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id: string
          payload: Json
          schema_version?: number
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          item_id?: string
          payload?: Json
          schema_version?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_assets: {
        Row: {
          alt_text: string
          created_at: string
          derivative_path: string | null
          focal_x: number
          focal_y: number
          height: number
          id: string
          original_bytes: number
          original_height: number
          original_path: string | null
          original_width: number
          owner_id: string
          ready_at: string | null
          sha256: string
          status: string
          width: number
        }
        Insert: {
          alt_text: string
          created_at?: string
          derivative_path?: string | null
          focal_x?: number
          focal_y?: number
          height: number
          id?: string
          original_bytes: number
          original_height: number
          original_path?: string | null
          original_width: number
          owner_id: string
          ready_at?: string | null
          sha256: string
          status?: string
          width: number
        }
        Update: {
          alt_text?: string
          created_at?: string
          derivative_path?: string | null
          focal_x?: number
          focal_y?: number
          height?: number
          id?: string
          original_bytes?: number
          original_height?: number
          original_path?: string | null
          original_width?: number
          owner_id?: string
          ready_at?: string | null
          sha256?: string
          status?: string
          width?: number
        }
        Relationships: []
      }
      editorial_audit: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: number
          item_id: string | null
          revision_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: never
          item_id?: string | null
          revision_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: never
          item_id?: string | null
          revision_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "editorial_audit_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "editorial_audit_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "content_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      editorial_invitation_events: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          error_code: string | null
          id: number
          request_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          error_code?: string | null
          id?: never
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          error_code?: string | null
          id?: never
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "editorial_invitation_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "editorial_invitations"
            referencedColumns: ["request_id"]
          },
        ]
      }
      editorial_invitations: {
        Row: {
          attempt_count: number
          auth_user_id: string | null
          completed_at: string | null
          created_at: string
          email: string
          error_code: string | null
          request_id: string
          requested_by: string
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          auth_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          email: string
          error_code?: string | null
          request_id: string
          requested_by: string
          role: string
          status: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          auth_user_id?: string | null
          completed_at?: string | null
          created_at?: string
          email?: string
          error_code?: string | null
          request_id?: string
          requested_by?: string
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      editorial_releases: {
        Row: {
          created_at: string
          created_by: string
          expected_map: Json
          id: string
          request_id: string
          snapshot: Json
        }
        Insert: {
          created_at?: string
          created_by: string
          expected_map: Json
          id?: string
          request_id: string
          snapshot: Json
        }
        Update: {
          created_at?: string
          created_by?: string
          expected_map?: Json
          id?: string
          request_id?: string
          snapshot?: Json
        }
        Relationships: []
      }
      team_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: number
          item_id: string | null
          new_active: boolean | null
          new_owner_id: string | null
          new_role: string | null
          old_active: boolean | null
          old_owner_id: string | null
          old_role: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: never
          item_id?: string | null
          new_active?: boolean | null
          new_owner_id?: string | null
          new_role?: string | null
          old_active?: boolean | null
          old_owner_id?: string | null
          old_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: never
          item_id?: string | null
          new_active?: boolean | null
          new_owner_id?: string | null
          new_role?: string | null
          old_active?: boolean | null
          old_owner_id?: string | null
          old_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_audit_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          active: boolean
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      activate_editorial_invitation: {
        Args: { p_request_id: string }
        Returns: string
      }
      archive_editorial_content: {
        Args: {
          p_archived: boolean
          p_expected_version: number
          p_item_id: string
        }
        Returns: number
      }
      assign_editorial_content: {
        Args: {
          p_expected_owner_id: string
          p_item_id: string
          p_owner_id: string
        }
        Returns: number
      }
      create_editorial_release: {
        Args: { p_expected_map: Json; p_request_id: string }
        Returns: string
      }
      list_editorial_members: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          email: string
          role: string
          user_id: string
        }[]
      }
      prepare_editorial_invitation: {
        Args: { p_email: string; p_request_id: string; p_role: string }
        Returns: {
          auth_user_id: string
          error_code: string
          should_send: boolean
          status: string
        }[]
      }
      record_editorial_invitation_result: {
        Args: {
          p_actor_id: string
          p_auth_user_id?: string
          p_error_code?: string
          p_request_id: string
          p_result: string
        }
        Returns: {
          error_code: string
          status: string
        }[]
      }
      review_editorial_content: {
        Args: { p_action: string; p_item_id: string; p_revision_id: string }
        Returns: undefined
      }
      save_editorial_content: {
        Args: {
          p_expected_version: number
          p_kind: string
          p_payload: Json
          p_stable_id: string
        }
        Returns: string
      }
      update_editorial_member: {
        Args: {
          p_active: boolean
          p_expected_active: boolean
          p_expected_role: string
          p_role: string
          p_user_id: string
        }
        Returns: boolean
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

