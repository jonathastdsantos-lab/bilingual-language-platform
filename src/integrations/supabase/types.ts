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
      appointment_confirmation_tokens: {
        Row: {
          appointment_id: string
          clinic_id: string
          confirmed_at: string | null
          created_at: string
          expires_at: string
          id: string
          patient_notes: string | null
          status: string
          token: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          patient_notes?: string | null
          status?: string
          token?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          confirmed_at?: string | null
          created_at?: string
          expires_at?: string
          id?: string
          patient_notes?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_confirmation_tokens_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_confirmation_tokens_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          notes: string | null
          patient_id: string
          price: number
          procedure: string | null
          professional_id: string
          room_id: string | null
          starts_at: string
          status: Database["public"]["Enums"]["appointment_status"]
          unit_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          notes?: string | null
          patient_id: string
          price?: number
          procedure?: string | null
          professional_id: string
          room_id?: string | null
          starts_at: string
          status?: Database["public"]["Enums"]["appointment_status"]
          unit_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          notes?: string | null
          patient_id?: string
          price?: number
          procedure?: string | null
          professional_id?: string
          room_id?: string | null
          starts_at?: string
          status?: Database["public"]["Enums"]["appointment_status"]
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          clinic_id: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          clinic_id: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          clinic_id?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_closings: {
        Row: {
          clinic_id: string
          closed_by: string | null
          closing_date: string
          created_at: string
          id: string
          net_balance: number
          notes: string | null
          total_expense: number
          total_income: number
          unit_id: string | null
        }
        Insert: {
          clinic_id: string
          closed_by?: string | null
          closing_date: string
          created_at?: string
          id?: string
          net_balance?: number
          notes?: string | null
          total_expense?: number
          total_income?: number
          unit_id?: string | null
        }
        Update: {
          clinic_id?: string
          closed_by?: string | null
          closing_date?: string
          created_at?: string
          id?: string
          net_balance?: number
          notes?: string | null
          total_expense?: number
          total_income?: number
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_closings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_closings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_booking_settings: {
        Row: {
          auto_confirm: boolean
          available_procedures: string[]
          clinic_id: string
          end_hour: string
          instructions: string | null
          online_booking_enabled: boolean
          operating_days: number[]
          slot_duration_minutes: number
          start_hour: string
          updated_at: string
        }
        Insert: {
          auto_confirm?: boolean
          available_procedures?: string[]
          clinic_id: string
          end_hour?: string
          instructions?: string | null
          online_booking_enabled?: boolean
          operating_days?: number[]
          slot_duration_minutes?: number
          start_hour?: string
          updated_at?: string
        }
        Update: {
          auto_confirm?: boolean
          available_procedures?: string[]
          clinic_id?: string
          end_hour?: string
          instructions?: string | null
          online_booking_enabled?: boolean
          operating_days?: number[]
          slot_duration_minutes?: number
          start_hour?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_booking_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_member_permissions: {
        Row: {
          clinic_id: string
          granted: boolean
          id: string
          member_id: string
          permission: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          clinic_id: string
          granted?: boolean
          id?: string
          member_id: string
          permission: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          clinic_id?: string
          granted?: boolean
          id?: string
          member_id?: string
          permission?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_member_permissions_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_member_permissions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "clinic_members"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          role: Database["public"]["Enums"]["clinic_role"]
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role: Database["public"]["Enums"]["clinic_role"]
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          role?: Database["public"]["Enums"]["clinic_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_units: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          clinic_id: string
          cnpj: string | null
          created_at: string
          id: string
          is_main: boolean
          name: string
          phone: string | null
          state: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          clinic_id: string
          cnpj?: string | null
          created_at?: string
          id?: string
          is_main?: boolean
          name: string
          phone?: string | null
          state?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          clinic_id?: string
          cnpj?: string | null
          created_at?: string
          id?: string
          is_main?: boolean
          name?: string
          phone?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinic_units_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinical_records: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          patient_id: string
          professional_id: string | null
          record_type: string
          title: string
          tooth_number: number | null
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id: string
          professional_id?: string | null
          record_type?: string
          title: string
          tooth_number?: number | null
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          patient_id?: string
          professional_id?: string | null
          record_type?: string
          title?: string
          tooth_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "clinical_records_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinical_records_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          cnpj: string | null
          created_at: string
          current_period_end: string | null
          email: string | null
          id: string
          name: string
          phone: string | null
          plan_id: string | null
          slug: string | null
          subscription_status: string
          timezone: string
          trial_ends_at: string | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          current_period_end?: string | null
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          plan_id?: string | null
          slug?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          current_period_end?: string | null
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          plan_id?: string | null
          slug?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clinics_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_rules: {
        Row: {
          calculation_type: Database["public"]["Enums"]["commission_calculation_type"]
          clinic_id: string
          created_at: string
          deduct_lab_costs: boolean
          fixed_amount: number
          id: string
          percentage: number
          procedure_name: string | null
          professional_id: string
          updated_at: string
        }
        Insert: {
          calculation_type?: Database["public"]["Enums"]["commission_calculation_type"]
          clinic_id: string
          created_at?: string
          deduct_lab_costs?: boolean
          fixed_amount?: number
          id?: string
          percentage?: number
          procedure_name?: string | null
          professional_id: string
          updated_at?: string
        }
        Update: {
          calculation_type?: Database["public"]["Enums"]["commission_calculation_type"]
          clinic_id?: string
          created_at?: string
          deduct_lab_costs?: boolean
          fixed_amount?: number
          id?: string
          percentage?: number
          procedure_name?: string | null
          professional_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_rules_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_rules_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlement_items: {
        Row: {
          appointment_id: string | null
          calculation_basis: number
          clinic_id: string
          commission_amount: number
          commission_rate: number
          created_at: string
          financial_entry_id: string | null
          gross_amount: number
          id: string
          lab_cost: number
          patient_id: string | null
          patient_name: string
          procedure_name: string
          service_date: string
          settlement_id: string
        }
        Insert: {
          appointment_id?: string | null
          calculation_basis?: number
          clinic_id: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          financial_entry_id?: string | null
          gross_amount?: number
          id?: string
          lab_cost?: number
          patient_id?: string | null
          patient_name: string
          procedure_name: string
          service_date: string
          settlement_id: string
        }
        Update: {
          appointment_id?: string | null
          calculation_basis?: number
          clinic_id?: string
          commission_amount?: number
          commission_rate?: number
          created_at?: string
          financial_entry_id?: string | null
          gross_amount?: number
          id?: string
          lab_cost?: number
          patient_id?: string | null
          patient_name?: string
          procedure_name?: string
          service_date?: string
          settlement_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlement_items_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlement_items_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "commission_settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      commission_settlements: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          financial_entry_id: string | null
          id: string
          net_commission_amount: number
          notes: string | null
          payment_date: string | null
          payment_method: string | null
          period_end: string
          period_start: string
          professional_id: string
          settlement_code: string
          status: Database["public"]["Enums"]["commission_settlement_status"]
          total_gross_amount: number
          total_lab_deductions: number
          total_other_deductions: number
          updated_at: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          financial_entry_id?: string | null
          id?: string
          net_commission_amount?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end: string
          period_start: string
          professional_id: string
          settlement_code: string
          status?: Database["public"]["Enums"]["commission_settlement_status"]
          total_gross_amount?: number
          total_lab_deductions?: number
          total_other_deductions?: number
          updated_at?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          financial_entry_id?: string | null
          id?: string
          net_commission_amount?: number
          notes?: string | null
          payment_date?: string | null
          payment_method?: string | null
          period_end?: string
          period_start?: string
          professional_id?: string
          settlement_code?: string
          status?: Database["public"]["Enums"]["commission_settlement_status"]
          total_gross_amount?: number
          total_lab_deductions?: number
          total_other_deductions?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commission_settlements_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_financial_entry_id_fkey"
            columns: ["financial_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "commission_settlements_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      dental_insurances: {
        Row: {
          active: boolean
          ans_code: string | null
          clinic_id: string
          cnpj: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          notes: string | null
          reimbursement_days: number
        }
        Insert: {
          active?: boolean
          ans_code?: string | null
          clinic_id: string
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          notes?: string | null
          reimbursement_days?: number
        }
        Update: {
          active?: boolean
          ans_code?: string | null
          clinic_id?: string
          cnpj?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          notes?: string | null
          reimbursement_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "dental_insurances_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      document_signature_requests: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          document_content: string
          document_title: string
          document_type: string
          expires_at: string
          id: string
          metadata: Json | null
          patient_id: string
          signed_signature_id: string | null
          signer_cpf: string | null
          signer_name: string | null
          signer_phone: string | null
          status: string
          token: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          document_content: string
          document_title: string
          document_type: string
          expires_at: string
          id?: string
          metadata?: Json | null
          patient_id: string
          signed_signature_id?: string | null
          signer_cpf?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
          token: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          document_content?: string
          document_title?: string
          document_type?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          patient_id?: string
          signed_signature_id?: string | null
          signer_cpf?: string | null
          signer_name?: string | null
          signer_phone?: string | null
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_signature_requests_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signature_requests_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_signature_requests_signed_signature_id_fkey"
            columns: ["signed_signature_id"]
            isOneToOne: false
            referencedRelation: "patient_electronic_signatures"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount: number
          appointment_id: string | null
          category: string
          clinic_id: string
          created_at: string
          created_by: string | null
          description: string
          due_date: string
          entry_type: Database["public"]["Enums"]["financial_entry_type"]
          id: string
          installment_number: number
          notes: string | null
          paid_at: string | null
          patient_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          professional_id: string | null
          status: Database["public"]["Enums"]["financial_entry_status"]
          total_installments: number
          treatment_plan_id: string | null
          unit_id: string | null
        }
        Insert: {
          amount: number
          appointment_id?: string | null
          category?: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          description: string
          due_date: string
          entry_type: Database["public"]["Enums"]["financial_entry_type"]
          id?: string
          installment_number?: number
          notes?: string | null
          paid_at?: string | null
          patient_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id?: string | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          total_installments?: number
          treatment_plan_id?: string | null
          unit_id?: string | null
        }
        Update: {
          amount?: number
          appointment_id?: string | null
          category?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string
          entry_type?: Database["public"]["Enums"]["financial_entry_type"]
          id?: string
          installment_number?: number
          notes?: string | null
          paid_at?: string | null
          patient_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          professional_id?: string | null
          status?: Database["public"]["Enums"]["financial_entry_status"]
          total_installments?: number
          treatment_plan_id?: string | null
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_treatment_plan_id_fkey"
            columns: ["treatment_plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      odontogram_entries: {
        Row: {
          clinic_id: string
          condition: Database["public"]["Enums"]["tooth_condition_status"]
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          patient_id: string
          procedure: string | null
          professional_id: string | null
          surface: Database["public"]["Enums"]["tooth_surface"]
          tooth_number: number
        }
        Insert: {
          clinic_id: string
          condition: Database["public"]["Enums"]["tooth_condition_status"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id: string
          procedure?: string | null
          professional_id?: string | null
          surface?: Database["public"]["Enums"]["tooth_surface"]
          tooth_number: number
        }
        Update: {
          clinic_id?: string
          condition?: Database["public"]["Enums"]["tooth_condition_status"]
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          patient_id?: string
          procedure?: string | null
          professional_id?: string | null
          surface?: Database["public"]["Enums"]["tooth_surface"]
          tooth_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "odontogram_entries_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontogram_entries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "odontogram_entries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      orthodontic_maintenances: {
        Row: {
          appointment_id: string | null
          brackets_replaced: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          elastics_used: string | null
          id: string
          lower_archwire: string | null
          maintenance_date: string
          maintenance_number: number
          next_appointment_date: string | null
          next_step_plan: string | null
          patient_hygiene_score: string
          patient_id: string
          procedures_performed: string
          treatment_id: string
          upper_archwire: string | null
        }
        Insert: {
          appointment_id?: string | null
          brackets_replaced?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          elastics_used?: string | null
          id?: string
          lower_archwire?: string | null
          maintenance_date?: string
          maintenance_number?: number
          next_appointment_date?: string | null
          next_step_plan?: string | null
          patient_hygiene_score?: string
          patient_id: string
          procedures_performed: string
          treatment_id: string
          upper_archwire?: string | null
        }
        Update: {
          appointment_id?: string | null
          brackets_replaced?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          elastics_used?: string | null
          id?: string
          lower_archwire?: string | null
          maintenance_date?: string
          maintenance_number?: number
          next_appointment_date?: string | null
          next_step_plan?: string | null
          patient_hygiene_score?: string
          patient_id?: string
          procedures_performed?: string
          treatment_id?: string
          upper_archwire?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_maintenances_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_maintenances_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_maintenances_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_maintenances_treatment_id_fkey"
            columns: ["treatment_id"]
            isOneToOne: false
            referencedRelation: "orthodontic_treatments"
            referencedColumns: ["id"]
          },
        ]
      }
      orthodontic_treatments: {
        Row: {
          appliance_type: string
          bracket_prescription: string
          clinic_id: string
          created_at: string
          diagnosis: string
          estimated_duration_months: number
          id: string
          lower_current_arch: string | null
          monthly_fee: number
          notes: string | null
          patient_id: string
          professional_id: string | null
          start_date: string
          status: string
          treatment_goal: string | null
          updated_at: string
          upper_current_arch: string | null
        }
        Insert: {
          appliance_type?: string
          bracket_prescription?: string
          clinic_id: string
          created_at?: string
          diagnosis: string
          estimated_duration_months?: number
          id?: string
          lower_current_arch?: string | null
          monthly_fee?: number
          notes?: string | null
          patient_id: string
          professional_id?: string | null
          start_date?: string
          status?: string
          treatment_goal?: string | null
          updated_at?: string
          upper_current_arch?: string | null
        }
        Update: {
          appliance_type?: string
          bracket_prescription?: string
          clinic_id?: string
          created_at?: string
          diagnosis?: string
          estimated_duration_months?: number
          id?: string
          lower_current_arch?: string | null
          monthly_fee?: number
          notes?: string | null
          patient_id?: string
          professional_id?: string | null
          start_date?: string
          status?: string
          treatment_goal?: string | null
          updated_at?: string
          upper_current_arch?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orthodontic_treatments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_treatments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orthodontic_treatments_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_anamnesis: {
        Row: {
          allergy_latex: boolean
          allergy_local_anesthetic: boolean
          allergy_nsaids: boolean
          allergy_penicillin: boolean
          asa_classification: string
          blood_pressure_diastolic: number | null
          blood_pressure_systolic: number | null
          chief_complaint: string | null
          clinic_id: string
          clinical_observations: string | null
          current_medications: string | null
          has_bleeding_disorder: boolean
          has_bruxism: boolean
          has_diabetes: boolean
          has_heart_disease: boolean
          has_hypertension: boolean
          id: string
          is_pregnant_or_lactating: boolean
          is_smoker: boolean
          other_allergies: string | null
          patient_id: string
          professional_id: string | null
          updated_at: string
          updated_by: string | null
          uses_anticoagulants: boolean
          uses_bisphosphonates: boolean
        }
        Insert: {
          allergy_latex?: boolean
          allergy_local_anesthetic?: boolean
          allergy_nsaids?: boolean
          allergy_penicillin?: boolean
          asa_classification?: string
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          chief_complaint?: string | null
          clinic_id: string
          clinical_observations?: string | null
          current_medications?: string | null
          has_bleeding_disorder?: boolean
          has_bruxism?: boolean
          has_diabetes?: boolean
          has_heart_disease?: boolean
          has_hypertension?: boolean
          id?: string
          is_pregnant_or_lactating?: boolean
          is_smoker?: boolean
          other_allergies?: string | null
          patient_id: string
          professional_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uses_anticoagulants?: boolean
          uses_bisphosphonates?: boolean
        }
        Update: {
          allergy_latex?: boolean
          allergy_local_anesthetic?: boolean
          allergy_nsaids?: boolean
          allergy_penicillin?: boolean
          asa_classification?: string
          blood_pressure_diastolic?: number | null
          blood_pressure_systolic?: number | null
          chief_complaint?: string | null
          clinic_id?: string
          clinical_observations?: string | null
          current_medications?: string | null
          has_bleeding_disorder?: boolean
          has_bruxism?: boolean
          has_diabetes?: boolean
          has_heart_disease?: boolean
          has_hypertension?: boolean
          id?: string
          is_pregnant_or_lactating?: boolean
          is_smoker?: boolean
          other_allergies?: string | null
          patient_id?: string
          professional_id?: string | null
          updated_at?: string
          updated_by?: string | null
          uses_anticoagulants?: boolean
          uses_bisphosphonates?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "patient_anamnesis_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_anamnesis_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_anamnesis_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_electronic_signatures: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          document_content: string
          document_hash: string
          document_title: string
          document_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          patient_id: string
          revocation_reason: string | null
          revoked_at: string | null
          signature_data_url: string
          signed_at: string
          signer_cpf: string
          signer_email: string | null
          signer_name: string
          signer_phone: string | null
          signer_role: string
          status: string
          user_agent: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          document_content: string
          document_hash: string
          document_title: string
          document_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          patient_id: string
          revocation_reason?: string | null
          revoked_at?: string | null
          signature_data_url: string
          signed_at?: string
          signer_cpf: string
          signer_email?: string | null
          signer_name: string
          signer_phone?: string | null
          signer_role?: string
          status?: string
          user_agent?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          document_content?: string
          document_hash?: string
          document_title?: string
          document_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          patient_id?: string
          revocation_reason?: string | null
          revoked_at?: string | null
          signature_data_url?: string
          signed_at?: string
          signer_cpf?: string
          signer_email?: string | null
          signer_name?: string
          signer_phone?: string | null
          signer_role?: string
          status?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_electronic_signatures_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_electronic_signatures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_exam_files: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          exam_category: string
          exam_date: string
          file_name: string
          file_size_bytes: number
          id: string
          mime_type: string
          notes: string | null
          patient_id: string
          professional_id: string | null
          storage_path: string
          title: string
          tooth_number: number | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          exam_category: string
          exam_date?: string
          file_name: string
          file_size_bytes: number
          id?: string
          mime_type: string
          notes?: string | null
          patient_id: string
          professional_id?: string | null
          storage_path: string
          title: string
          tooth_number?: number | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          exam_category?: string
          exam_date?: string
          file_name?: string
          file_size_bytes?: number
          id?: string
          mime_type?: string
          notes?: string | null
          patient_id?: string
          professional_id?: string | null
          storage_path?: string
          title?: string
          tooth_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "patient_exam_files_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_exam_files_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_exam_files_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          address: string | null
          allergies: string | null
          anamnesis: string | null
          birth_date: string | null
          clinic_id: string
          clinical_notes: string | null
          cpf: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          whatsapp: string | null
        }
        Insert: {
          address?: string | null
          allergies?: string | null
          anamnesis?: string | null
          birth_date?: string | null
          clinic_id: string
          clinical_notes?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          whatsapp?: string | null
        }
        Update: {
          address?: string | null
          allergies?: string | null
          anamnesis?: string | null
          birth_date?: string | null
          clinic_id?: string
          clinical_notes?: string | null
          cpf?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_webhook_events: {
        Row: {
          created_at: string
          event_type: string
          external_reference: string | null
          gateway: string
          id: string
          invoice_id: string | null
          payload: Json
          processed: boolean
          processed_at: string | null
          processing_error: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          external_reference?: string | null
          gateway: string
          id?: string
          invoice_id?: string | null
          payload: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          external_reference?: string | null
          gateway?: string
          id?: string
          invoice_id?: string | null
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_webhook_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "saas_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      pediatric_dental_assessments: {
        Row: {
          assessment_date: string
          atypical_swallowing: boolean
          bottle_feeding_habit: Json
          brushing_frequency_daily: number
          bruxism: boolean
          caries_risk_level: string
          clinic_id: string
          clinical_notes: string | null
          created_at: string
          dentition_stage: string
          evaluator_id: string | null
          floss_frequency: string
          fluoride_ppm: number
          id: string
          mouth_breathing: boolean
          pacifier_habit: Json
          patient_id: string
          sugar_intake_frequency: string
          thumb_sucking_habit: Json
          toothpaste_amount: string
          updated_at: string
        }
        Insert: {
          assessment_date?: string
          atypical_swallowing?: boolean
          bottle_feeding_habit?: Json
          brushing_frequency_daily?: number
          bruxism?: boolean
          caries_risk_level?: string
          clinic_id: string
          clinical_notes?: string | null
          created_at?: string
          dentition_stage?: string
          evaluator_id?: string | null
          floss_frequency?: string
          fluoride_ppm?: number
          id?: string
          mouth_breathing?: boolean
          pacifier_habit?: Json
          patient_id: string
          sugar_intake_frequency?: string
          thumb_sucking_habit?: Json
          toothpaste_amount?: string
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          atypical_swallowing?: boolean
          bottle_feeding_habit?: Json
          brushing_frequency_daily?: number
          bruxism?: boolean
          caries_risk_level?: string
          clinic_id?: string
          clinical_notes?: string | null
          created_at?: string
          dentition_stage?: string
          evaluator_id?: string | null
          floss_frequency?: string
          fluoride_ppm?: number
          id?: string
          mouth_breathing?: boolean
          pacifier_habit?: Json
          patient_id?: string
          sugar_intake_frequency?: string
          thumb_sucking_habit?: Json
          toothpaste_amount?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pediatric_dental_assessments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pediatric_dental_assessments_evaluator_id_fkey"
            columns: ["evaluator_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pediatric_dental_assessments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_broadcast_announcements: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          message: string
          priority: string
          target_clinic_id: string | null
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          message: string
          priority?: string
          target_clinic_id?: string | null
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          message?: string
          priority?: string
          target_clinic_id?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_broadcast_announcements_target_clinic_id_fkey"
            columns: ["target_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_clinic_notes: {
        Row: {
          author_email: string
          clinic_id: string
          content: string
          created_at: string
          id: string
        }
        Insert: {
          author_email: string
          clinic_id: string
          content: string
          created_at?: string
          id?: string
        }
        Update: {
          author_email?: string
          clinic_id?: string
          content?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_clinic_notes_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_gateway_settings: {
        Row: {
          asaas_api_key: string | null
          asaas_enabled: boolean
          asaas_environment: string
          asaas_webhook_token: string | null
          id: string
          mercadopago_access_token: string | null
          mercadopago_enabled: boolean
          mercadopago_environment: string
          mercadopago_webhook_secret: string | null
          stripe_enabled: boolean
          stripe_secret_key: string | null
          stripe_webhook_secret: string | null
          updated_at: string
        }
        Insert: {
          asaas_api_key?: string | null
          asaas_enabled?: boolean
          asaas_environment?: string
          asaas_webhook_token?: string | null
          id?: string
          mercadopago_access_token?: string | null
          mercadopago_enabled?: boolean
          mercadopago_environment?: string
          mercadopago_webhook_secret?: string | null
          stripe_enabled?: boolean
          stripe_secret_key?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Update: {
          asaas_api_key?: string | null
          asaas_enabled?: boolean
          asaas_environment?: string
          asaas_webhook_token?: string | null
          id?: string
          mercadopago_access_token?: string | null
          mercadopago_enabled?: boolean
          mercadopago_environment?: string
          mercadopago_webhook_secret?: string | null
          stripe_enabled?: boolean
          stripe_secret_key?: string | null
          stripe_webhook_secret?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      platform_superadmin_audit_logs: {
        Row: {
          action: string
          admin_email: string
          created_at: string
          details: Json | null
          id: string
          target_clinic_id: string | null
        }
        Insert: {
          action: string
          admin_email: string
          created_at?: string
          details?: Json | null
          id?: string
          target_clinic_id?: string | null
        }
        Update: {
          action?: string
          admin_email?: string
          created_at?: string
          details?: Json | null
          id?: string
          target_clinic_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_superadmin_audit_logs_target_clinic_id_fkey"
            columns: ["target_clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_superadmins: {
        Row: {
          created_at: string
          email: string
          id: string
          is_active: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          user_id?: string
        }
        Relationships: []
      }
      procedure_catalog: {
        Row: {
          active: boolean
          base_price: number
          clinic_id: string
          created_at: string
          created_by: string | null
          default_duration_minutes: number
          estimated_material_cost: number
          id: string
          insurance_id: string | null
          name: string
          specialty: string
          tuss_code: string | null
        }
        Insert: {
          active?: boolean
          base_price?: number
          clinic_id: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number
          estimated_material_cost?: number
          id?: string
          insurance_id?: string | null
          name: string
          specialty?: string
          tuss_code?: string | null
        }
        Update: {
          active?: boolean
          base_price?: number
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          default_duration_minutes?: number
          estimated_material_cost?: number
          id?: string
          insurance_id?: string | null
          name?: string
          specialty?: string
          tuss_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "procedure_catalog_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "procedure_catalog_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "dental_insurances"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_digital_certificates: {
        Row: {
          certificate_public_pem: string | null
          certificate_type: string
          clinic_id: string
          cloud_account_email: string | null
          created_at: string
          cro_number: string | null
          cro_state: string | null
          id: string
          issuer: string
          metadata: Json | null
          professional_id: string
          serial_number: string
          status: string
          subject_cpf: string
          subject_name: string
          updated_at: string
          valid_from: string
          valid_to: string
        }
        Insert: {
          certificate_public_pem?: string | null
          certificate_type: string
          clinic_id: string
          cloud_account_email?: string | null
          created_at?: string
          cro_number?: string | null
          cro_state?: string | null
          id?: string
          issuer: string
          metadata?: Json | null
          professional_id: string
          serial_number: string
          status?: string
          subject_cpf: string
          subject_name: string
          updated_at?: string
          valid_from: string
          valid_to: string
        }
        Update: {
          certificate_public_pem?: string | null
          certificate_type?: string
          clinic_id?: string
          cloud_account_email?: string | null
          created_at?: string
          cro_number?: string | null
          cro_state?: string | null
          id?: string
          issuer?: string
          metadata?: Json | null
          professional_id?: string
          serial_number?: string
          status?: string
          subject_cpf?: string
          subject_name?: string
          updated_at?: string
          valid_from?: string
          valid_to?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_digital_certificates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "professional_digital_certificates_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          active: boolean
          clinic_id: string
          color: string
          commission_pct: number
          created_at: string
          id: string
          name: string
          specialty: string | null
        }
        Insert: {
          active?: boolean
          clinic_id: string
          color?: string
          commission_pct?: number
          created_at?: string
          id?: string
          name: string
          specialty?: string | null
        }
        Update: {
          active?: boolean
          clinic_id?: string
          color?: string
          commission_pct?: number
          created_at?: string
          id?: string
          name?: string
          specialty?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          locale: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          locale?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          locale?: string
        }
        Relationships: []
      }
      prosthetic_lab_orders: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          delivered_date: string | null
          due_date: string
          financial_entry_generated: boolean
          id: string
          lab_cost: number
          laboratory_name: string
          notes: string | null
          patient_id: string
          professional_id: string | null
          prosthesis_type: string
          sent_date: string
          stage: string
          tooth_numbers: string | null
          updated_at: string
          vita_shade: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          due_date: string
          financial_entry_generated?: boolean
          id?: string
          lab_cost?: number
          laboratory_name: string
          notes?: string | null
          patient_id: string
          professional_id?: string | null
          prosthesis_type: string
          sent_date?: string
          stage?: string
          tooth_numbers?: string | null
          updated_at?: string
          vita_shade?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          delivered_date?: string | null
          due_date?: string
          financial_entry_generated?: boolean
          id?: string
          lab_cost?: number
          laboratory_name?: string
          notes?: string | null
          patient_id?: string
          professional_id?: string | null
          prosthesis_type?: string
          sent_date?: string
          stage?: string
          tooth_numbers?: string | null
          updated_at?: string
          vita_shade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "prosthetic_lab_orders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prosthetic_lab_orders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prosthetic_lab_orders_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      qualified_document_signatures: {
        Row: {
          authority_chain: string[] | null
          certificate_id: string | null
          clinic_id: string
          created_at: string
          cryptographic_signature: string
          document_content: string
          document_hash: string
          document_title: string
          document_type: string
          id: string
          metadata: Json | null
          patient_id: string
          professional_id: string
          signed_at: string
          signer_cpf: string
          signer_cro: string
          signer_name: string
          timestamp_authority: string | null
          validation_code: string
          validation_url: string
        }
        Insert: {
          authority_chain?: string[] | null
          certificate_id?: string | null
          clinic_id: string
          created_at?: string
          cryptographic_signature: string
          document_content: string
          document_hash: string
          document_title: string
          document_type: string
          id?: string
          metadata?: Json | null
          patient_id: string
          professional_id: string
          signed_at?: string
          signer_cpf: string
          signer_cro: string
          signer_name: string
          timestamp_authority?: string | null
          validation_code: string
          validation_url: string
        }
        Update: {
          authority_chain?: string[] | null
          certificate_id?: string | null
          clinic_id?: string
          created_at?: string
          cryptographic_signature?: string
          document_content?: string
          document_hash?: string
          document_title?: string
          document_type?: string
          id?: string
          metadata?: Json | null
          patient_id?: string
          professional_id?: string
          signed_at?: string
          signer_cpf?: string
          signer_cro?: string
          signer_name?: string
          timestamp_authority?: string | null
          validation_code?: string
          validation_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualified_document_signatures_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "professional_digital_certificates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_document_signatures_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_document_signatures_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualified_document_signatures_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          name: string
          unit_id: string | null
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          name: string
          unit_id?: string | null
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          name?: string
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rooms_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_invoices: {
        Row: {
          amount: number
          billing_cycle: string
          card_brand: string | null
          card_last4: string | null
          clinic_id: string
          created_at: string
          due_date: string
          gateway_payment_id: string | null
          id: string
          notes: string | null
          paid_at: string | null
          payment_method: string
          pix_code: string | null
          pix_qr_code_url: string | null
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          billing_cycle?: string
          card_brand?: string | null
          card_last4?: string | null
          clinic_id: string
          created_at?: string
          due_date: string
          gateway_payment_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          pix_code?: string | null
          pix_qr_code_url?: string | null
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          billing_cycle?: string
          card_brand?: string | null
          card_last4?: string | null
          clinic_id?: string
          created_at?: string
          due_date?: string
          gateway_payment_id?: string | null
          id?: string
          notes?: string | null
          paid_at?: string | null
          payment_method?: string
          pix_code?: string | null
          pix_qr_code_url?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "saas_invoices_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saas_invoices_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "saas_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      saas_plans: {
        Row: {
          active: boolean
          created_at: string
          description: string
          id: string
          max_professionals: number
          max_units: number
          monthly_price: number
          name: string
          storage_limit_mb: number
          whatsapp_included: boolean
          yearly_price: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          description: string
          id: string
          max_professionals?: number
          max_units?: number
          monthly_price?: number
          name: string
          storage_limit_mb?: number
          whatsapp_included?: boolean
          yearly_price?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string
          id?: string
          max_professionals?: number
          max_units?: number
          monthly_price?: number
          name?: string
          storage_limit_mb?: number
          whatsapp_included?: boolean
          yearly_price?: number
        }
        Relationships: []
      }
      stock_items: {
        Row: {
          active: boolean
          batch_number: string | null
          category: string
          clinic_id: string
          created_at: string
          created_by: string | null
          current_quantity: number
          expiration_date: string | null
          id: string
          min_quantity: number
          name: string
          sku: string | null
          storage_location: string | null
          supplier: string | null
          unit_cost: number
          unit_id: string | null
          unit_measure: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          batch_number?: string | null
          category: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          current_quantity?: number
          expiration_date?: string | null
          id?: string
          min_quantity?: number
          name: string
          sku?: string | null
          storage_location?: string | null
          supplier?: string | null
          unit_cost?: number
          unit_id?: string | null
          unit_measure?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          batch_number?: string | null
          category?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          current_quantity?: number
          expiration_date?: string | null
          id?: string
          min_quantity?: number
          name?: string
          sku?: string | null
          storage_location?: string | null
          supplier?: string | null
          unit_cost?: number
          unit_id?: string | null
          unit_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          batch_number: string | null
          clinic_id: string
          created_at: string
          created_by: string | null
          expiration_date: string | null
          id: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          patient_id: string | null
          previous_quantity: number
          professional_id: string | null
          quantity: number
          reason: string
          resulting_quantity: number
          unit_cost: number
          unit_id: string | null
        }
        Insert: {
          batch_number?: string | null
          clinic_id: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          item_id: string
          movement_type: Database["public"]["Enums"]["stock_movement_type"]
          patient_id?: string | null
          previous_quantity: number
          professional_id?: string | null
          quantity: number
          reason: string
          resulting_quantity: number
          unit_cost?: number
          unit_id?: string | null
        }
        Update: {
          batch_number?: string | null
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          expiration_date?: string | null
          id?: string
          item_id?: string
          movement_type?: Database["public"]["Enums"]["stock_movement_type"]
          patient_id?: string | null
          previous_quantity?: number
          professional_id?: string | null
          quantity?: number
          reason?: string
          resulting_quantity?: number
          unit_cost?: number
          unit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      tiss_guide_items: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          glosa_reason: string | null
          glosed: boolean
          guide_id: string
          id: string
          quantity: number
          tooth_number: number | null
          tooth_surface: string | null
          total_price: number
          tuss_code: string
          unit_price: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          glosa_reason?: string | null
          glosed?: boolean
          guide_id: string
          id?: string
          quantity?: number
          tooth_number?: number | null
          tooth_surface?: string | null
          total_price?: number
          tuss_code: string
          unit_price?: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          glosa_reason?: string | null
          glosed?: boolean
          guide_id?: string
          id?: string
          quantity?: number
          tooth_number?: number | null
          tooth_surface?: string | null
          total_price?: number
          tuss_code?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "tiss_guide_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiss_guide_items_guide_id_fkey"
            columns: ["guide_id"]
            isOneToOne: false
            referencedRelation: "tiss_guides"
            referencedColumns: ["id"]
          },
        ]
      }
      tiss_guides: {
        Row: {
          auth_code: string | null
          billed_date: string | null
          card_expiration: string | null
          card_number: string
          clinic_id: string
          cns_number: string | null
          created_at: string
          created_by: string | null
          glosed_amount: number
          guide_number: string
          guide_type: string
          id: string
          insurance_id: string | null
          issue_date: string
          notes: string | null
          paid_date: string | null
          patient_id: string
          professional_id: string | null
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          auth_code?: string | null
          billed_date?: string | null
          card_expiration?: string | null
          card_number: string
          clinic_id: string
          cns_number?: string | null
          created_at?: string
          created_by?: string | null
          glosed_amount?: number
          guide_number: string
          guide_type?: string
          id?: string
          insurance_id?: string | null
          issue_date?: string
          notes?: string | null
          paid_date?: string | null
          patient_id: string
          professional_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          auth_code?: string | null
          billed_date?: string | null
          card_expiration?: string | null
          card_number?: string
          clinic_id?: string
          cns_number?: string | null
          created_at?: string
          created_by?: string | null
          glosed_amount?: number
          guide_number?: string
          guide_type?: string
          id?: string
          insurance_id?: string | null
          issue_date?: string
          notes?: string | null
          paid_date?: string | null
          patient_id?: string
          professional_id?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tiss_guides_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiss_guides_insurance_id_fkey"
            columns: ["insurance_id"]
            isOneToOne: false
            referencedRelation: "dental_insurances"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiss_guides_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tiss_guides_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plan_items: {
        Row: {
          clinic_id: string
          completed_at: string | null
          created_at: string
          id: string
          plan_id: string
          price: number
          procedure_name: string
          status: string
          surface: Database["public"]["Enums"]["tooth_surface"]
          tooth_number: number | null
        }
        Insert: {
          clinic_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          plan_id: string
          price?: number
          procedure_name: string
          status?: string
          surface?: Database["public"]["Enums"]["tooth_surface"]
          tooth_number?: number | null
        }
        Update: {
          clinic_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          price?: number
          procedure_name?: string
          status?: string
          surface?: Database["public"]["Enums"]["tooth_surface"]
          tooth_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plan_items_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plan_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "treatment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_plans: {
        Row: {
          clinic_id: string
          created_at: string
          created_by: string | null
          discount_amount: number
          id: string
          notes: string | null
          patient_id: string
          professional_id: string | null
          status: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          patient_id: string
          professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          discount_amount?: number
          id?: string
          notes?: string | null
          patient_id?: string
          professional_id?: string | null
          status?: Database["public"]["Enums"]["treatment_plan_status"]
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "treatment_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_plans_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      waiting_room_calls: {
        Row: {
          called_at: string
          clinic_id: string
          created_at: string
          id: string
          patient_id: string | null
          patient_name: string
          priority: string
          professional_id: string | null
          professional_name: string
          room_id: string | null
          room_name: string
          status: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          called_at?: string
          clinic_id: string
          created_at?: string
          id?: string
          patient_id?: string | null
          patient_name: string
          priority?: string
          professional_id?: string | null
          professional_name: string
          room_id?: string | null
          room_name: string
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          called_at?: string
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string | null
          patient_name?: string
          priority?: string
          professional_id?: string | null
          professional_name?: string
          room_id?: string | null
          room_name?: string
          status?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiting_room_calls_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_room_calls_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_room_calls_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_room_calls_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiting_room_calls_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "clinic_units"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_appointment_reminders: {
        Row: {
          appointment_id: string
          clinic_id: string
          created_at: string
          error_message: string | null
          id: string
          message_text: string | null
          patient_id: string
          recipient_phone: string | null
          reminder_type: string
          scheduled_for: string
          sent_at: string | null
          status: string
        }
        Insert: {
          appointment_id: string
          clinic_id: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text?: string | null
          patient_id: string
          recipient_phone?: string | null
          reminder_type: string
          scheduled_for: string
          sent_at?: string | null
          status?: string
        }
        Update: {
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message_text?: string | null
          patient_id?: string
          recipient_phone?: string | null
          reminder_type?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_appointment_reminders_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_appointment_reminders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_appointment_reminders_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_dispatch_logs: {
        Row: {
          appointment_id: string | null
          clinic_id: string
          created_at: string
          id: string
          patient_id: string | null
          phone_number: string
          rendered_message: string
          sent_by: string | null
          template_category: string
        }
        Insert: {
          appointment_id?: string | null
          clinic_id: string
          created_at?: string
          id?: string
          patient_id?: string | null
          phone_number: string
          rendered_message: string
          sent_by?: string | null
          template_category: string
        }
        Update: {
          appointment_id?: string | null
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string | null
          phone_number?: string
          rendered_message?: string
          sent_by?: string | null
          template_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_dispatch_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatch_logs_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_dispatch_logs_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_reminder_settings: {
        Row: {
          auto_dispatch_active: boolean
          clinic_id: string
          enabled_24h: boolean
          enabled_2h: boolean
          template_24h: string
          template_2h: string
          updated_at: string
        }
        Insert: {
          auto_dispatch_active?: boolean
          clinic_id: string
          enabled_24h?: boolean
          enabled_2h?: boolean
          template_24h?: string
          template_2h?: string
          updated_at?: string
        }
        Update: {
          auto_dispatch_active?: boolean
          clinic_id?: string
          enabled_24h?: boolean
          enabled_2h?: boolean
          template_24h?: string
          template_2h?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_reminder_settings_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: true
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_templates: {
        Row: {
          active: boolean
          body_template: string
          category: string
          clinic_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          body_template: string
          category: string
          clinic_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          body_template?: string
          category?: string
          clinic_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_templates_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_clinic_member: {
        Args: {
          _clinic: string
          _email: string
          _role: Database["public"]["Enums"]["clinic_role"]
        }
        Returns: string
      }
      approve_and_pay_commission_settlement: {
        Args: {
          _payment_date?: string
          _payment_method?: string
          _settlement_id: string
        }
        Returns: Json
      }
      calculate_professional_commission_preview: {
        Args: {
          _clinic_id: string
          _end_date: string
          _professional_id: string
          _start_date: string
        }
        Returns: Json
      }
      create_clinic: { Args: { _name: string }; Returns: string }
      get_public_available_booking_slots: {
        Args: { _clinic_id: string; _date: string; _professional_id: string }
        Returns: Json
      }
      get_public_clinic_booking_data: {
        Args: { _identifier: string }
        Returns: Json
      }
      get_upcoming_appointment_reminders: {
        Args: { _clinic_id: string }
        Returns: Json
      }
      has_clinic_permission:
        | {
            Args: {
              _clinic: string
              _default_roles: Database["public"]["Enums"]["clinic_role"][]
              _permission: string
            }
            Returns: boolean
          }
        | {
            Args: { _clinic_id: string; _permission: string; _user_id: string }
            Returns: boolean
          }
      has_clinic_role: {
        Args: {
          _clinic: string
          _roles: Database["public"]["Enums"]["clinic_role"][]
        }
        Returns: boolean
      }
      is_clinic_member: { Args: { _clinic: string }; Returns: boolean }
      is_platform_superadmin: { Args: { user_uuid?: string }; Returns: boolean }
      mark_appointment_reminder_sent: {
        Args: {
          _appointment_id: string
          _clinic_id: string
          _message: string
          _patient_id: string
          _phone: string
          _reminder_type: string
        }
        Returns: Json
      }
      submit_public_appointment_booking: {
        Args: {
          _clinic_id: string
          _notes?: string
          _patient_cpf: string
          _patient_email?: string
          _patient_name: string
          _patient_phone: string
          _procedure: string
          _professional_id: string
          _starts_at: string
          _unit_id: string
        }
        Returns: Json
      }
      user_has_permission: {
        Args: { _clinic_id: string; _permission: string }
        Returns: boolean
      }
    }
    Enums: {
      appointment_status:
        | "scheduled"
        | "confirmed"
        | "completed"
        | "cancelled"
        | "no_show"
      clinic_role:
        | "owner"
        | "admin"
        | "dentist"
        | "receptionist"
        | "assistant"
        | "finance"
        | "stock"
      commission_calculation_type:
        | "percentage_gross"
        | "percentage_net_of_lab"
        | "fixed_amount"
      commission_settlement_status: "draft" | "approved" | "paid" | "cancelled"
      financial_entry_status: "pending" | "paid" | "overdue" | "cancelled"
      financial_entry_type: "income" | "expense"
      payment_method:
        | "pix"
        | "credit_card"
        | "debit_card"
        | "cash"
        | "bank_slip"
        | "transfer"
        | "insurance"
      stock_movement_type: "in" | "out" | "adjustment" | "expired_loss"
      tooth_condition_status:
        | "healthy"
        | "caries"
        | "restoration"
        | "planned"
        | "completed"
        | "endodontics"
        | "crown"
        | "implant"
        | "missing"
      tooth_surface: "W" | "O" | "M" | "D" | "V" | "L"
      treatment_plan_status:
        | "draft"
        | "approved"
        | "in_progress"
        | "completed"
        | "cancelled"
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
    Enums: {
      appointment_status: [
        "scheduled",
        "confirmed",
        "completed",
        "cancelled",
        "no_show",
      ],
      clinic_role: [
        "owner",
        "admin",
        "dentist",
        "receptionist",
        "assistant",
        "finance",
        "stock",
      ],
      commission_calculation_type: [
        "percentage_gross",
        "percentage_net_of_lab",
        "fixed_amount",
      ],
      commission_settlement_status: ["draft", "approved", "paid", "cancelled"],
      financial_entry_status: ["pending", "paid", "overdue", "cancelled"],
      financial_entry_type: ["income", "expense"],
      payment_method: [
        "pix",
        "credit_card",
        "debit_card",
        "cash",
        "bank_slip",
        "transfer",
        "insurance",
      ],
      stock_movement_type: ["in", "out", "adjustment", "expired_loss"],
      tooth_condition_status: [
        "healthy",
        "caries",
        "restoration",
        "planned",
        "completed",
        "endodontics",
        "crown",
        "implant",
        "missing",
      ],
      tooth_surface: ["W", "O", "M", "D", "V", "L"],
      treatment_plan_status: [
        "draft",
        "approved",
        "in_progress",
        "completed",
        "cancelled",
      ],
    },
  },
} as const
