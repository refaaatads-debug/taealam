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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          booking_id: string
          created_at: string
          device_id: string
          disconnected_at: string | null
          id: string
          is_connected: boolean
          last_heartbeat: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          device_id: string
          disconnected_at?: string | null
          id?: string
          is_connected?: boolean
          last_heartbeat?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          device_id?: string
          disconnected_at?: string | null
          id?: string
          is_connected?: boolean
          last_heartbeat?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          created_at: string
          id: string
          messages: Json
          subject: string | null
          tokens_used: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          subject?: string | null
          tokens_used?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          subject?: string | null
          tokens_used?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_logs: {
        Row: {
          booking_id: string | null
          created_at: string
          error_message: string | null
          evaluator_feedback: string | null
          feature_name: string
          id: string
          input_summary: string | null
          is_regenerated: boolean | null
          output_summary: string | null
          quality_score: number | null
          response_time_ms: number | null
          retry_count: number | null
          status: string
          usefulness_score: number | null
          user_id: string | null
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluator_feedback?: string | null
          feature_name: string
          id?: string
          input_summary?: string | null
          is_regenerated?: boolean | null
          output_summary?: string | null
          quality_score?: number | null
          response_time_ms?: number | null
          retry_count?: number | null
          status?: string
          usefulness_score?: number | null
          user_id?: string | null
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          error_message?: string | null
          evaluator_feedback?: string | null
          feature_name?: string
          id?: string
          input_summary?: string | null
          is_regenerated?: boolean | null
          output_summary?: string | null
          quality_score?: number | null
          response_time_ms?: number | null
          retry_count?: number | null
          status?: string
          usefulness_score?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      badges: {
        Row: {
          created_at: string
          description_ar: string | null
          icon: string | null
          id: string
          name: string
          name_ar: string
          points_required: number | null
        }
        Insert: {
          created_at?: string
          description_ar?: string | null
          icon?: string | null
          id?: string
          name: string
          name_ar: string
          points_required?: number | null
        }
        Update: {
          created_at?: string
          description_ar?: string | null
          icon?: string | null
          id?: string
          name?: string
          name_ar?: string
          points_required?: number | null
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          duration_minutes: number
          expires_at: string | null
          group_id: string | null
          id: string
          price: number | null
          scheduled_at: string
          status: string
          student_id: string
          subject_id: string | null
          teaching_stage: string | null
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          duration_minutes?: number
          expires_at?: string | null
          group_id?: string | null
          id?: string
          price?: number | null
          scheduled_at: string
          status?: string
          student_id: string
          subject_id?: string | null
          teaching_stage?: string | null
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          duration_minutes?: number
          expires_at?: string | null
          group_id?: string | null
          id?: string
          price?: number | null
          scheduled_at?: string
          status?: string
          student_id?: string
          subject_id?: string | null
          teaching_stage?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_requests_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          duration_minutes: number
          id: string
          meeting_link: string | null
          notes: string | null
          price: number | null
          scheduled_at: string
          session_status: string | null
          status: Database["public"]["Enums"]["booking_status"]
          student_id: string
          subject_id: string | null
          subscription_id: string | null
          teacher_id: string
          updated_at: string
          used_subscription: boolean | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          notes?: string | null
          price?: number | null
          scheduled_at: string
          session_status?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          student_id: string
          subject_id?: string | null
          subscription_id?: string | null
          teacher_id: string
          updated_at?: string
          used_subscription?: boolean | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          notes?: string | null
          price?: number | null
          scheduled_at?: string
          session_status?: string | null
          status?: Database["public"]["Enums"]["booking_status"]
          student_id?: string
          subject_id?: string | null
          subscription_id?: string | null
          teacher_id?: string
          updated_at?: string
          used_subscription?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "user_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_logs: {
        Row: {
          booking_id: string | null
          cost: number | null
          created_at: string
          duration_minutes: number | null
          ended_at: string | null
          error_message: string | null
          estimated_minutes: number | null
          id: string
          status: string
          student_id: string | null
          student_phone: string | null
          teacher_id: string
          twilio_call_sid: string | null
        }
        Insert: {
          booking_id?: string | null
          cost?: number | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          error_message?: string | null
          estimated_minutes?: number | null
          id?: string
          status?: string
          student_id?: string | null
          student_phone?: string | null
          teacher_id: string
          twilio_call_sid?: string | null
        }
        Update: {
          booking_id?: string | null
          cost?: number | null
          created_at?: string
          duration_minutes?: number | null
          ended_at?: string | null
          error_message?: string | null
          estimated_minutes?: number | null
          id?: string
          status?: string
          student_id?: string | null
          student_phone?: string | null
          teacher_id?: string
          twilio_call_sid?: string | null
        }
        Relationships: []
      }
      call_transcripts: {
        Row: {
          call_log_id: string | null
          created_at: string
          id: string
          is_violation: boolean
          segment_end_ms: number | null
          segment_start_ms: number | null
          speaker: string
          text: string
          twilio_call_sid: string
          violation_type: string | null
        }
        Insert: {
          call_log_id?: string | null
          created_at?: string
          id?: string
          is_violation?: boolean
          segment_end_ms?: number | null
          segment_start_ms?: number | null
          speaker?: string
          text: string
          twilio_call_sid: string
          violation_type?: string | null
        }
        Update: {
          call_log_id?: string | null
          created_at?: string
          id?: string
          is_violation?: boolean
          segment_end_ms?: number | null
          segment_start_ms?: number | null
          speaker?: string
          text?: string
          twilio_call_sid?: string
          violation_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "call_transcripts_call_log_id_fkey"
            columns: ["call_log_id"]
            isOneToOne: false
            referencedRelation: "call_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          booking_id: string
          content: string
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_filtered: boolean | null
          sender_id: string
        }
        Insert: {
          booking_id: string
          content: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_filtered?: boolean | null
          sender_id: string
        }
        Update: {
          booking_id?: string
          content?: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_filtered?: boolean | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_months: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          id: string
          month: string
          status: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month: string
          status?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          id?: string
          month?: string
          status?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          file_name: string | null
          file_url: string | null
          id: string
          is_read: boolean | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_read?: boolean | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: []
      }
      parent_students: {
        Row: {
          created_at: string
          id: string
          parent_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parent_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parent_id?: string
          student_id?: string
        }
        Relationships: []
      }
      payment_records: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string | null
          id: string
          metadata: Json | null
          payment_type: string | null
          plan_id: string | null
          status: string | null
          stripe_payment_intent: string | null
          stripe_session_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json | null
          payment_type?: string | null
          plan_id?: string | null
          status?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string | null
          id?: string
          metadata?: Json | null
          payment_type?: string | null
          plan_id?: string | null
          status?: string | null
          stripe_payment_intent?: string | null
          stripe_session_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          free_trial_used: boolean | null
          full_name: string
          id: string
          level: string | null
          notify_after_session: boolean | null
          notify_before_session: boolean | null
          notify_subscription_expiry: boolean | null
          phone: string | null
          referral_code: string | null
          teaching_stage: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          free_trial_used?: boolean | null
          full_name?: string
          id?: string
          level?: string | null
          notify_after_session?: boolean | null
          notify_before_session?: boolean | null
          notify_subscription_expiry?: boolean | null
          phone?: string | null
          referral_code?: string | null
          teaching_stage?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          free_trial_used?: boolean | null
          full_name?: string
          id?: string
          level?: string | null
          notify_after_session?: boolean | null
          notify_before_session?: boolean | null
          notify_subscription_expiry?: boolean | null
          phone?: string | null
          referral_code?: string | null
          teaching_stage?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          rating: number
          student_id: string
          teacher_id: string
        }
        Insert: {
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          rating: number
          student_id: string
          teacher_id: string
        }
        Update: {
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          rating?: number
          student_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      session_events: {
        Row: {
          booking_id: string | null
          created_at: string
          device_id: string | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          device_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          device_id?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      session_materials: {
        Row: {
          attachments: Json | null
          created_at: string
          description: string | null
          duration_minutes: number
          expires_at: string
          id: string
          is_deleted: boolean
          recording_url: string | null
          session_id: string
          student_id: string
          teacher_id: string
          title: string
          whiteboard_data: Json | null
        }
        Insert: {
          attachments?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          expires_at?: string
          id?: string
          is_deleted?: boolean
          recording_url?: string | null
          session_id: string
          student_id: string
          teacher_id: string
          title?: string
          whiteboard_data?: Json | null
        }
        Update: {
          attachments?: Json | null
          created_at?: string
          description?: string | null
          duration_minutes?: number
          expires_at?: string
          id?: string
          is_deleted?: boolean
          recording_url?: string | null
          session_id?: string
          student_id?: string
          teacher_id?: string
          title?: string
          whiteboard_data?: Json | null
        }
        Relationships: []
      }
      session_reminders_sent: {
        Row: {
          booking_id: string
          id: string
          reminder_type: string
          sent_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          id?: string
          reminder_type?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          id?: string
          reminder_type?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          ai_report: string | null
          booking_id: string
          created_at: string
          deducted_minutes: number | null
          duration_minutes: number | null
          ended_at: string | null
          id: string
          recording_url: string | null
          room_id: string | null
          short_session: boolean | null
          started_at: string | null
          teacher_earning: number | null
        }
        Insert: {
          ai_report?: string | null
          booking_id: string
          created_at?: string
          deducted_minutes?: number | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          recording_url?: string | null
          room_id?: string | null
          short_session?: boolean | null
          started_at?: string | null
          teacher_earning?: number | null
        }
        Update: {
          ai_report?: string | null
          booking_id?: string
          created_at?: string
          deducted_minutes?: number | null
          duration_minutes?: number | null
          ended_at?: string | null
          id?: string
          recording_url?: string | null
          room_id?: string | null
          short_session?: boolean | null
          started_at?: string | null
          teacher_earning?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: true
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          category: string
          created_at: string
          id: string
          key: string
          label_ar: string | null
          type: string
          updated_at: string
          value: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          key: string
          label_ar?: string | null
          type?: string
          updated_at?: string
          value?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          key?: string
          label_ar?: string | null
          type?: string
          updated_at?: string
          value?: string | null
        }
        Relationships: []
      }
      student_badges: {
        Row: {
          badge_id: string
          earned_at: string
          id: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          id?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_badges_badge_id_fkey"
            columns: ["badge_id"]
            isOneToOne: false
            referencedRelation: "badges"
            referencedColumns: ["id"]
          },
        ]
      }
      student_levels: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          max_points: number
          min_points: number
          name: string
          name_ar: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          max_points: number
          min_points?: number
          name: string
          name_ar: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          max_points?: number
          min_points?: number
          name?: string
          name_ar?: string
        }
        Relationships: []
      }
      student_points: {
        Row: {
          created_at: string
          id: string
          last_activity_at: string | null
          streak_days: number | null
          total_points: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_activity_at?: string | null
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_activity_at?: string | null
          streak_days?: number | null
          total_points?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          assigned_user_id: string | null
          created_at: string
          features: Json | null
          has_ai_tutor: boolean | null
          has_priority_booking: boolean | null
          has_recording: boolean | null
          id: string
          is_active: boolean | null
          name_ar: string
          price: number
          session_duration_minutes: number
          sessions_count: number
          stripe_error: string | null
          stripe_last_synced_at: string | null
          stripe_price_id: string | null
          stripe_product_id: string | null
          stripe_sync_status: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string | null
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string
          features?: Json | null
          has_ai_tutor?: boolean | null
          has_priority_booking?: boolean | null
          has_recording?: boolean | null
          id?: string
          is_active?: boolean | null
          name_ar: string
          price: number
          session_duration_minutes?: number
          sessions_count: number
          stripe_error?: string | null
          stripe_last_synced_at?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_sync_status?: string | null
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string
          features?: Json | null
          has_ai_tutor?: boolean | null
          has_priority_booking?: boolean | null
          has_recording?: boolean | null
          id?: string
          is_active?: boolean | null
          name_ar?: string
          price?: number
          session_duration_minutes?: number
          sessions_count?: number
          stripe_error?: string | null
          stripe_last_synced_at?: string | null
          stripe_price_id?: string | null
          stripe_product_id?: string | null
          stripe_sync_status?: string | null
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string | null
        }
        Relationships: []
      }
      subscription_plans_backup_20260423: {
        Row: {
          assigned_user_id: string | null
          created_at: string | null
          features: Json | null
          has_ai_tutor: boolean | null
          has_priority_booking: boolean | null
          has_recording: boolean | null
          id: string | null
          name_ar: string | null
          price: number | null
          session_duration_minutes: number | null
          sessions_count: number | null
          tier: Database["public"]["Enums"]["subscription_tier"] | null
        }
        Insert: {
          assigned_user_id?: string | null
          created_at?: string | null
          features?: Json | null
          has_ai_tutor?: boolean | null
          has_priority_booking?: boolean | null
          has_recording?: boolean | null
          id?: string | null
          name_ar?: string | null
          price?: number | null
          session_duration_minutes?: number | null
          sessions_count?: number | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
        }
        Update: {
          assigned_user_id?: string | null
          created_at?: string | null
          features?: Json | null
          has_ai_tutor?: boolean | null
          has_priority_booking?: boolean | null
          has_recording?: boolean | null
          id?: string | null
          name_ar?: string | null
          price?: number | null
          session_duration_minutes?: number | null
          sessions_count?: number | null
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          content: string
          created_at: string
          file_name: string | null
          file_type: string | null
          file_url: string | null
          id: string
          is_admin: boolean
          sender_id: string
          ticket_id: string
        }
        Insert: {
          content: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_admin?: boolean
          sender_id: string
          ticket_id: string
        }
        Update: {
          content?: string
          created_at?: string
          file_name?: string | null
          file_type?: string | null
          file_url?: string | null
          id?: string
          is_admin?: boolean
          sender_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          category: string
          created_at: string
          id: string
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_logs: {
        Row: {
          created_at: string
          id: string
          level: string
          message: string
          metadata: Json | null
          source: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          level?: string
          message: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          source?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      teacher_certificates: {
        Row: {
          created_at: string
          file_name: string | null
          file_url: string
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          file_url: string
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          file_url?: string
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_daily_stats: {
        Row: {
          created_at: string
          date: string
          id: string
          teacher_id: string
          total_minutes: number
          total_sessions: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          teacher_id: string
          total_minutes?: number
          total_sessions?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          teacher_id?: string
          total_minutes?: number
          total_sessions?: number
        }
        Relationships: []
      }
      teacher_earnings: {
        Row: {
          added_by_admin: string
          amount: number
          created_at: string
          hours: number | null
          id: string
          invoice_id: string | null
          minutes_snapshot: number | null
          month: string
          notes: string | null
          status: string
          teacher_id: string
          total_sessions_snapshot: number | null
        }
        Insert: {
          added_by_admin: string
          amount: number
          created_at?: string
          hours?: number | null
          id?: string
          invoice_id?: string | null
          minutes_snapshot?: number | null
          month: string
          notes?: string | null
          status?: string
          teacher_id: string
          total_sessions_snapshot?: number | null
        }
        Update: {
          added_by_admin?: string
          amount?: number
          created_at?: string
          hours?: number | null
          id?: string
          invoice_id?: string | null
          minutes_snapshot?: number | null
          month?: string
          notes?: string | null
          status?: string
          teacher_id?: string
          total_sessions_snapshot?: number | null
        }
        Relationships: []
      }
      teacher_first_impressions: {
        Row: {
          id: string
          shown_at: string
          student_id: string
          teacher_id: string
        }
        Insert: {
          id?: string
          shown_at?: string
          student_id: string
          teacher_id: string
        }
        Update: {
          id?: string
          shown_at?: string
          student_id?: string
          teacher_id?: string
        }
        Relationships: []
      }
      teacher_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_method: string | null
          teacher_id: string
          withdrawal_request_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          teacher_id: string
          withdrawal_request_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method?: string | null
          teacher_id?: string
          withdrawal_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teacher_payments_withdrawal_request_id_fkey"
            columns: ["withdrawal_request_id"]
            isOneToOne: false
            referencedRelation: "withdrawal_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_profiles: {
        Row: {
          account_holder_name: string | null
          available_days: string[] | null
          available_from: string | null
          available_to: string | null
          avg_rating: number | null
          balance: number
          bank_name: string | null
          bio: string | null
          created_at: string
          hourly_rate: number
          iban: string | null
          id: string
          is_approved: boolean | null
          is_verified: boolean | null
          nationality: string | null
          teaching_stages: string[] | null
          total_reviews: number | null
          total_sessions: number | null
          updated_at: string
          user_id: string
          years_experience: number | null
        }
        Insert: {
          account_holder_name?: string | null
          available_days?: string[] | null
          available_from?: string | null
          available_to?: string | null
          avg_rating?: number | null
          balance?: number
          bank_name?: string | null
          bio?: string | null
          created_at?: string
          hourly_rate?: number
          iban?: string | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          nationality?: string | null
          teaching_stages?: string[] | null
          total_reviews?: number | null
          total_sessions?: number | null
          updated_at?: string
          user_id: string
          years_experience?: number | null
        }
        Update: {
          account_holder_name?: string | null
          available_days?: string[] | null
          available_from?: string | null
          available_to?: string | null
          avg_rating?: number | null
          balance?: number
          bank_name?: string | null
          bio?: string | null
          created_at?: string
          hourly_rate?: number
          iban?: string | null
          id?: string
          is_approved?: boolean | null
          is_verified?: boolean | null
          nationality?: string | null
          teaching_stages?: string[] | null
          total_reviews?: number | null
          total_sessions?: number | null
          updated_at?: string
          user_id?: string
          years_experience?: number | null
        }
        Relationships: []
      }
      teacher_subjects: {
        Row: {
          id: string
          subject_id: string
          teacher_id: string
        }
        Insert: {
          id?: string
          subject_id: string
          teacher_id: string
        }
        Update: {
          id?: string
          subject_id?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "public_teacher_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teacher_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teacher_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_active_session: {
        Row: {
          created_at: string
          device_info: string | null
          last_seen: string
          session_token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          last_seen?: string
          session_token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          last_seen?: string
          session_token?: string
          user_id?: string
        }
        Relationships: []
      }
      user_permissions: {
        Row: {
          granted_at: string
          granted_by: string
          id: string
          notes: string | null
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by: string
          id?: string
          notes?: string | null
          permission: Database["public"]["Enums"]["app_permission"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string
          id?: string
          notes?: string | null
          permission?: Database["public"]["Enums"]["app_permission"]
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          auto_renew: boolean | null
          created_at: string
          ends_at: string
          id: string
          is_active: boolean | null
          plan_id: string | null
          remaining_minutes: number
          sessions_remaining: number
          starts_at: string
          total_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_renew?: boolean | null
          created_at?: string
          ends_at: string
          id?: string
          is_active?: boolean | null
          plan_id?: string | null
          remaining_minutes?: number
          sessions_remaining?: number
          starts_at?: string
          total_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_renew?: boolean | null
          created_at?: string
          ends_at?: string
          id?: string
          is_active?: boolean | null
          plan_id?: string | null
          remaining_minutes?: number
          sessions_remaining?: number
          starts_at?: string
          total_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_warnings: {
        Row: {
          banned_until: string | null
          created_at: string
          description: string | null
          id: string
          is_banned: boolean | null
          user_id: string
          warning_count: number
          warning_type: string
        }
        Insert: {
          banned_until?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_banned?: boolean | null
          user_id: string
          warning_count?: number
          warning_type?: string
        }
        Update: {
          banned_until?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_banned?: boolean | null
          user_id?: string
          warning_count?: number
          warning_type?: string
        }
        Relationships: []
      }
      violations: {
        Row: {
          booking_id: string | null
          confidence_score: number | null
          created_at: string
          detected_text: string
          id: string
          is_false_positive: boolean | null
          is_reviewed: boolean | null
          original_message: string | null
          review_notes: string | null
          reviewed_by: string | null
          source: string
          timestamp_in_session: number | null
          user_id: string
          violation_type: string
        }
        Insert: {
          booking_id?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_text: string
          id?: string
          is_false_positive?: boolean | null
          is_reviewed?: boolean | null
          original_message?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          source?: string
          timestamp_in_session?: number | null
          user_id: string
          violation_type?: string
        }
        Update: {
          booking_id?: string | null
          confidence_score?: number | null
          created_at?: string
          detected_text?: string
          id?: string
          is_false_positive?: boolean | null
          is_reviewed?: boolean | null
          original_message?: string | null
          review_notes?: string | null
          reviewed_by?: string | null
          source?: string
          timestamp_in_session?: number | null
          user_id?: string
          violation_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "violations_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string | null
          id: string
          reference_id: string | null
          stripe_session_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          stripe_session_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string | null
          id?: string
          reference_id?: string | null
          stripe_session_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webrtc_signals: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          payload: Json
          sender_id: string
          signal_type: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          payload?: Json
          sender_id: string
          signal_type: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          payload?: Json
          sender_id?: string
          signal_type?: string
        }
        Relationships: []
      }
      withdrawal_requests: {
        Row: {
          admin_notes: string | null
          amount: number
          attachment_name: string | null
          attachment_url: string | null
          created_at: string
          id: string
          status: string
          teacher_id: string
          teacher_notes: string | null
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          amount: number
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          status?: string
          teacher_id: string
          teacher_notes?: string | null
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          attachment_name?: string | null
          attachment_url?: string | null
          created_at?: string
          id?: string
          status?: string
          teacher_id?: string
          teacher_notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string | null
          id: string | null
          level: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          level?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string | null
          level?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      public_teacher_profiles: {
        Row: {
          available_days: string[] | null
          available_from: string | null
          available_to: string | null
          avg_rating: number | null
          bio: string | null
          created_at: string | null
          hourly_rate: number | null
          id: string | null
          is_approved: boolean | null
          is_verified: boolean | null
          nationality: string | null
          teaching_stages: string[] | null
          total_reviews: number | null
          total_sessions: number | null
          updated_at: string | null
          user_id: string | null
          years_experience: number | null
        }
        Insert: {
          available_days?: string[] | null
          available_from?: string | null
          available_to?: string | null
          avg_rating?: number | null
          bio?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_approved?: boolean | null
          is_verified?: boolean | null
          nationality?: string | null
          teaching_stages?: string[] | null
          total_reviews?: number | null
          total_sessions?: number | null
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Update: {
          available_days?: string[] | null
          available_from?: string | null
          available_to?: string | null
          avg_rating?: number | null
          bio?: string | null
          created_at?: string | null
          hourly_rate?: number | null
          id?: string | null
          is_approved?: boolean | null
          is_verified?: boolean | null
          nationality?: string | null
          teaching_stages?: string[] | null
          total_reviews?: number | null
          total_sessions?: number | null
          updated_at?: string | null
          user_id?: string | null
          years_experience?: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_booking_group: {
        Args: { _group_id: string; _teacher_id: string }
        Returns: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          duration_minutes: number
          expires_at: string | null
          group_id: string | null
          id: string
          price: number | null
          scheduled_at: string
          status: string
          student_id: string
          subject_id: string | null
          teaching_stage: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "booking_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      accept_booking_request: {
        Args: { _request_id: string; _teacher_id: string }
        Returns: boolean
      }
      cleanup_old_chat_messages: { Args: never; Returns: number }
      credit_wallet_balance: {
        Args: {
          _amount: number
          _description: string
          _stripe_session_id: string
          _user_id: string
        }
        Returns: number
      }
      deduct_wallet_balance: {
        Args: {
          _amount: number
          _description: string
          _reference_id: string
          _user_id: string
        }
        Returns: number
      }
      has_permission: {
        Args: {
          _permission: Database["public"]["Enums"]["app_permission"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_new_user_role: {
        Args: { _role: Database["public"]["Enums"]["app_role"] }
        Returns: undefined
      }
      teacher_monthly_cancellations: {
        Args: { _teacher_id: string }
        Returns: number
      }
    }
    Enums: {
      app_permission:
        | "customer_support"
        | "manage_bookings"
        | "manage_teachers"
        | "manage_content"
        | "view_reports"
        | "manage_payments"
        | "manage_coupons"
        | "view_overview"
        | "manage_users"
        | "view_teacher_performance"
        | "manage_session_reports"
        | "manage_session_pricing"
        | "manage_materials"
        | "manage_plans"
        | "manage_withdrawals"
        | "manage_teacher_payments"
        | "manage_teacher_earnings"
        | "manage_wallets"
        | "manage_violations"
        | "manage_ai_audit"
        | "manage_notifications"
      app_role: "student" | "teacher" | "parent" | "admin"
      booking_status: "pending" | "confirmed" | "completed" | "cancelled"
      subscription_tier: "basic" | "standard" | "premium" | "free"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_permission: [
        "customer_support",
        "manage_bookings",
        "manage_teachers",
        "manage_content",
        "view_reports",
        "manage_payments",
        "manage_coupons",
        "view_overview",
        "manage_users",
        "view_teacher_performance",
        "manage_session_reports",
        "manage_session_pricing",
        "manage_materials",
        "manage_plans",
        "manage_withdrawals",
        "manage_teacher_payments",
        "manage_teacher_earnings",
        "manage_wallets",
        "manage_violations",
        "manage_ai_audit",
        "manage_notifications",
      ],
      app_role: ["student", "teacher", "parent", "admin"],
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      subscription_tier: ["basic", "standard", "premium", "free"],
    },
  },
} as const
