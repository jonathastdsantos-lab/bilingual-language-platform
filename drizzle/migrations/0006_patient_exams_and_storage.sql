-- =============================================================================
-- SondaPro — Migration 0006 (Drizzle): Galeria de Exames, Radiografias e Fotos
-- Intraorais (Antes/Depois) com Bucket Privado no Supabase Storage e RLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.patient_exam_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  professional_id UUID REFERENCES public.professionals(id) ON DELETE SET NULL,
  tooth_number SMALLINT CHECK (
    tooth_number IS NULL
    OR (tooth_number BETWEEN 11 AND 48)
    OR (tooth_number BETWEEN 51 AND 85)
  ),
  exam_category TEXT NOT NULL CHECK (
    exam_category IN (
      'periapical',
      'panoramic',
      'bitewing',
      'tomography',
      'intraoral_before',
      'intraoral_after',
      'document'
    )
  ),
  title TEXT NOT NULL CHECK (char_length(trim(title)) BETWEEN 2 AND 160),
  notes TEXT,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (
    mime_type IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 15728640),
  storage_path TEXT NOT NULL UNIQUE,
  exam_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patient_exam_files_clinic_patient
  ON public.patient_exam_files(clinic_id, patient_id, exam_date DESC);

GRANT SELECT, INSERT, DELETE ON public.patient_exam_files TO authenticated;
GRANT ALL ON public.patient_exam_files TO service_role;

ALTER TABLE public.patient_exam_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_exam_files_select_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_select_policy"
  ON public.patient_exam_files
  FOR SELECT
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.read'));

DROP POLICY IF EXISTS "patient_exam_files_insert_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_insert_policy"
  ON public.patient_exam_files
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP POLICY IF EXISTS "patient_exam_files_delete_policy" ON public.patient_exam_files;
CREATE POLICY "patient_exam_files_delete_policy"
  ON public.patient_exam_files
  FOR DELETE
  TO authenticated
  USING (public.has_clinic_permission(auth.uid(), clinic_id, 'records.write'));

DROP TRIGGER IF EXISTS trg_audit_patient_exam_files ON public.patient_exam_files;
CREATE TRIGGER trg_audit_patient_exam_files
  AFTER INSERT OR DELETE ON public.patient_exam_files
  FOR EACH ROW EXECUTE FUNCTION public.log_audit();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinical-exams',
  'clinical-exams',
  FALSE,
  15728640,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
  public = FALSE,
  file_size_limit = 15728640,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

DROP POLICY IF EXISTS "clinical_exams_storage_select" ON storage.objects;
CREATE POLICY "clinical_exams_storage_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.read')
  );

DROP POLICY IF EXISTS "clinical_exams_storage_insert" ON storage.objects;
CREATE POLICY "clinical_exams_storage_insert"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.write')
  );

DROP POLICY IF EXISTS "clinical_exams_storage_delete" ON storage.objects;
CREATE POLICY "clinical_exams_storage_delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'clinical-exams'
    AND (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    AND public.has_clinic_permission(auth.uid(), ((storage.foldername(name))[1])::uuid, 'records.write')
  );

