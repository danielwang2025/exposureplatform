
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "child_members": {
                  Row: {
                    "child_id": string,"created_at": string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"role": Database["public"]['Enums']["member_role"],"user_id": string
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"role"?: Database["public"]['Enums']["member_role"],"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "child_members_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "child_members_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"children": {
                  Row: {
                    "avatar_path": string | null,"birth_date": string | null,"created_at": string,"created_by": string | null,"guardian_consent_at": string,"id": string,"max_visibility": Database["public"]['Enums']["visibility"],"nickname": string,"slug": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_path"?: string | null,"birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"guardian_consent_at"?: string,"id"?: string,"max_visibility"?: Database["public"]['Enums']["visibility"],"nickname": string,"slug"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "avatar_path"?: string | null,"birth_date"?: string | null,"created_at"?: string,"created_by"?: string | null,"guardian_consent_at"?: string,"id"?: string,"max_visibility"?: Database["public"]['Enums']["visibility"],"nickname"?: string,"slug"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "children_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"comments": {
                  Row: {
                    "author_id": string,"body": string,"child_id": string,"created_at": string,"id": string,"post_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id": string,"body": string,"child_id": string,"created_at"?: string,"id"?: string,"post_id": string,"updated_at"?: string
                  }
                  Update: {
                    "author_id"?: string,"body"?: string,"child_id"?: string,"created_at"?: string,"id"?: string,"post_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "comments_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "comments_post_id_child_id_fkey"
      columns: ["post_id","child_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","child_id"]
    }
                  ]
                },"invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by": string | null,"child_id": string,"created_at": string,"email": string,"expires_at": string,"id": string,"invited_by": string | null,"role": Database["public"]['Enums']["member_role"],"token": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"child_id": string,"created_at"?: string,"email": string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role": Database["public"]['Enums']["member_role"],"token"?: string
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by"?: string | null,"child_id"?: string,"created_at"?: string,"email"?: string,"expires_at"?: string,"id"?: string,"invited_by"?: string | null,"role"?: Database["public"]['Enums']["member_role"],"token"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "invitations_accepted_by_fkey"
      columns: ["accepted_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "invitations_invited_by_fkey"
      columns: ["invited_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"media": {
                  Row: {
                    "bytes": number,"child_id": string,"created_at": string,"duration_seconds": number | null,"error": string | null,"height": number | null,"id": string,"kind": Database["public"]['Enums']["media_kind"],"mux_asset_id": string | null,"mux_playback_id": string | null,"mux_upload_id": string | null,"position": number,"post_id": string,"status": Database["public"]['Enums']["media_status"],"storage_path": string | null,"thumb_path": string | null,"uploader_id": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "bytes"?: number,"child_id": string,"created_at"?: string,"duration_seconds"?: number | null,"error"?: string | null,"height"?: number | null,"id"?: string,"kind": Database["public"]['Enums']["media_kind"],"mux_asset_id"?: string | null,"mux_playback_id"?: string | null,"mux_upload_id"?: string | null,"position"?: number,"post_id": string,"status"?: Database["public"]['Enums']["media_status"],"storage_path"?: string | null,"thumb_path"?: string | null,"uploader_id"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "bytes"?: number,"child_id"?: string,"created_at"?: string,"duration_seconds"?: number | null,"error"?: string | null,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["media_kind"],"mux_asset_id"?: string | null,"mux_playback_id"?: string | null,"mux_upload_id"?: string | null,"position"?: number,"post_id"?: string,"status"?: Database["public"]['Enums']["media_status"],"storage_path"?: string | null,"thumb_path"?: string | null,"uploader_id"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "media_post_id_child_id_fkey"
      columns: ["post_id","child_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","child_id"]
    },{
      foreignKeyName: "media_uploader_id_fkey"
      columns: ["uploader_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"post_likes": {
                  Row: {
                    "child_id": string,"created_at": string,"post_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"post_id": string,"user_id": string
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"post_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "post_likes_post_id_child_id_fkey"
      columns: ["post_id","child_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","child_id"]
    },{
      foreignKeyName: "post_likes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"posts": {
                  Row: {
                    "author_id": string | null,"body": string,"child_id": string,"created_at": string,"id": string,"kind": Database["public"]['Enums']["post_kind"],"occurred_on": string,"project_id": string | null,"title": string | null,"updated_at": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "author_id"?: string | null,"body"?: string,"child_id": string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["post_kind"],"occurred_on"?: string,"project_id"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "author_id"?: string | null,"body"?: string,"child_id"?: string,"created_at"?: string,"id"?: string,"kind"?: Database["public"]['Enums']["post_kind"],"occurred_on"?: string,"project_id"?: string | null,"title"?: string | null,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "posts_author_id_fkey"
      columns: ["author_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "posts_project_fkey"
      columns: ["project_id","child_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","child_id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"guardian_attested_at": string | null,"id": string,"storage_quota_bytes": number,"storage_used_bytes": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name"?: string,"guardian_attested_at"?: string | null,"id": string,"storage_quota_bytes"?: number,"storage_used_bytes"?: number
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"guardian_attested_at"?: string | null,"id"?: string,"storage_quota_bytes"?: number,"storage_used_bytes"?: number
                  }
                  Relationships: [
                    
                  ]
                },"projects": {
                  Row: {
                    "child_id": string,"created_at": string,"created_by": string | null,"description": string,"emoji": string | null,"id": string,"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"emoji"?: string | null,"id"?: string,"title": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"created_by"?: string | null,"description"?: string,"emoji"?: string | null,"id"?: string,"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "projects_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "projects_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"reports": {
                  Row: {
                    "child_id": string,"created_at": string,"created_by": string | null,"highlight_media_ids": (string)[],"id": string,"period_end": string,"period_start": string,"summary": string,"title": string,"updated_at": string,"visibility": Database["public"]['Enums']["visibility"]
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"created_by"?: string | null,"highlight_media_ids"?: (string)[],"id"?: string,"period_end": string,"period_start": string,"summary"?: string,"title": string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"created_by"?: string | null,"highlight_media_ids"?: (string)[],"id"?: string,"period_end"?: string,"period_start"?: string,"summary"?: string,"title"?: string,"updated_at"?: string,"visibility"?: Database["public"]['Enums']["visibility"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "reports_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "reports_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"share_links": {
                  Row: {
                    "child_id": string,"created_at": string,"created_by": string | null,"expires_at": string | null,"id": string,"label": string | null,"last_viewed_at": string | null,"post_id": string | null,"project_id": string | null,"revoked_at": string | null,"scope": Database["public"]['Enums']["share_scope"],"token": string,"view_count": number
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_viewed_at"?: string | null,"post_id"?: string | null,"project_id"?: string | null,"revoked_at"?: string | null,"scope": Database["public"]['Enums']["share_scope"],"token"?: string,"view_count"?: number
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"created_by"?: string | null,"expires_at"?: string | null,"id"?: string,"label"?: string | null,"last_viewed_at"?: string | null,"post_id"?: string | null,"project_id"?: string | null,"revoked_at"?: string | null,"scope"?: Database["public"]['Enums']["share_scope"],"token"?: string,"view_count"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_links_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_links_post_id_child_id_fkey"
      columns: ["post_id","child_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","child_id"]
    },{
      foreignKeyName: "share_links_project_id_child_id_fkey"
      columns: ["project_id","child_id"]
isOneToOne: false
      referencedRelation: "projects"
      referencedColumns: ["id","child_id"]
    }
                  ]
                },"skill_ratings": {
                  Row: {
                    "child_id": string,"created_at": string,"post_id": string,"score": number,"skill_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "child_id": string,"created_at"?: string,"post_id": string,"score": number,"skill_id": string
                  }
                  Update: {
                    "child_id"?: string,"created_at"?: string,"post_id"?: string,"score"?: number,"skill_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skill_ratings_post_id_child_id_fkey"
      columns: ["post_id","child_id"]
isOneToOne: false
      referencedRelation: "posts"
      referencedColumns: ["id","child_id"]
    },{
      foreignKeyName: "skill_ratings_skill_id_child_id_fkey"
      columns: ["skill_id","child_id"]
isOneToOne: false
      referencedRelation: "skills"
      referencedColumns: ["id","child_id"]
    }
                  ]
                },"skills": {
                  Row: {
                    "archived_at": string | null,"child_id": string,"created_at": string,"created_by": string | null,"emoji": string | null,"id": string,"name": string,"position": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived_at"?: string | null,"child_id": string,"created_at"?: string,"created_by"?: string | null,"emoji"?: string | null,"id"?: string,"name": string,"position"?: number,"updated_at"?: string
                  }
                  Update: {
                    "archived_at"?: string | null,"child_id"?: string,"created_at"?: string,"created_by"?: string | null,"emoji"?: string | null,"id"?: string,"name"?: string,"position"?: number,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "skills_child_id_fkey"
      columns: ["child_id"]
isOneToOne: false
      referencedRelation: "children"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "skills_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "accept_invitation":
{ Args: { "p_token": string }; Returns: string
                           },
"can_edit_post":
{ Args: { "p_post_id": string }; Returns: boolean
                           },
"can_edit_report":
{ Args: { "p_child_id": string,"p_created_by": string }; Returns: boolean
                           },
"can_read_post":
{ Args: { "p_child_id": string,"p_visibility": Database["public"]['Enums']["visibility"] }; Returns: boolean
                           },
"child_role":
{ Args: { "p_child_id": string }; Returns: Database["public"]['Enums']["member_role"]
                           },
"create_child":
{ Args: { "p_birth_date"?: string,"p_max_visibility"?: Database["public"]['Enums']["visibility"],"p_nickname": string }; Returns: string
                           },
"create_media":
{ Args: { "p_bytes": number,"p_kind": Database["public"]['Enums']["media_kind"],"p_post_id": string }; Returns: {
              "bytes": number,
"child_id": string,
"created_at": string,
"duration_seconds": number | null,
"error": string | null,
"height": number | null,
"id": string,
"kind": Database["public"]['Enums']["media_kind"],
"mux_asset_id": string | null,
"mux_playback_id": string | null,
"mux_upload_id": string | null,
"position": number,
"post_id": string,
"status": Database["public"]['Enums']["media_status"],
"storage_path": string | null,
"thumb_path": string | null,
"uploader_id": string | null,
"width": number | null
            }
                          SetofOptions: {
        from: "*"
        to: "media"
        isOneToOne: true
        isSetofReturn: false
      } },
"effective_visibility":
{ Args: { "p_child_id": string,"p_visibility": Database["public"]['Enums']["visibility"] }; Returns: Database["public"]['Enums']["visibility"]
                           },
"fail_media":
{ Args: { "p_error": string,"p_media_id": string }; Returns: undefined
                           },
"get_invitation":
{ Args: { "p_token": string }; Returns: {
              "child_nickname": string,"email": string,"inviter_name": string,"role": Database["public"]['Enums']["member_role"],"status": string
            }[]
                           },
"has_child_role":
{ Args: { "p_child_id": string,"p_min_role": Database["public"]['Enums']["member_role"] }; Returns: boolean
                           },
"public_child":
{ Args: { "p_slug": string }; Returns: {
              "child_age_years": number,"child_nickname": string
            }[]
                           },
"public_post_ids":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_slug": string }; Returns: {
              "post_id": string,"project_emoji": string,"project_title": string
            }[]
                           },
"resolve_share":
{ Args: { "p_token": string }; Returns: {
              "child_age_years": number,"child_nickname": string,"project_description": string,"project_emoji": string,"project_title": string,"scope": Database["public"]['Enums']["share_scope"]
            }[]
                           },
"set_child_slug":
{ Args: { "p_child_id": string,"p_slug": string }; Returns: string
                           },
"set_post_ratings":
{ Args: { "p_post_id": string,"p_ratings": Json }; Returns: undefined
                           },
"settle_media":
{ Args: { "p_bytes": number,"p_duration"?: number,"p_height"?: number,"p_media_id": string,"p_width"?: number }; Returns: undefined
                           },
"shared_post_ids":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_token": string }; Returns: {
              "post_id": string,"project_emoji": string,"project_title": string
            }[]
                           },
"shares_child_with":
{ Args: { "p_user_id": string }; Returns: boolean
                           },
"teacher_can_read_post":
{ Args: { "p_child_id": string,"p_kind": Database["public"]['Enums']["post_kind"],"p_visibility": Database["public"]['Enums']["visibility"] }; Returns: boolean
                           }
          }
          Enums: {
            "media_kind": "image"|"video","media_status": "pending"|"ready"|"failed","member_role": "viewer"|"teacher"|"editor"|"owner","post_kind": "moment"|"milestone"|"review","share_scope": "child"|"project"|"post","visibility": "private"|"family"|"link"|"public"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "media_kind": ["image", "video"],"media_status": ["pending", "ready", "failed"],"member_role": ["viewer", "teacher", "editor", "owner"],"post_kind": ["moment", "milestone", "review"],"share_scope": ["child", "project", "post"],"visibility": ["private", "family", "link", "public"]
          }
        }
} as const
