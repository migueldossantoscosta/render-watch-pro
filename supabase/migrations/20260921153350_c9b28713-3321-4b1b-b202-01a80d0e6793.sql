
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  os TEXT,
  agent_version TEXT,
  agent_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(24), 'hex'),
  pairing_code TEXT NOT NULL DEFAULT upper(substr(encode(gen_random_bytes(8),'hex'),1,8)),
  paired BOOLEAN NOT NULL DEFAULT false,
  online BOOLEAN NOT NULL DEFAULT false,
  shutdown_when_finished BOOLEAN NOT NULL DEFAULT false,
  thermal_limit_c INTEGER NOT NULL DEFAULT 85,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX devices_pairing_code_key ON public.devices(pairing_code);
CREATE UNIQUE INDEX devices_agent_token_key ON public.devices(agent_token);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices" ON public.devices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.owns_device(_device_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.devices d WHERE d.id = _device_id AND d.user_id = auth.uid());
$$;

CREATE TABLE public.telemetry_samples (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices ON DELETE CASCADE,
  cpu_temp_c NUMERIC,
  cpu_load_pct NUMERIC,
  gpu_temp_c NUMERIC,
  gpu_load_pct NUMERIC,
  gpu_fan_pct NUMERIC,
  gpu_power_w NUMERIC,
  vram_used_mb NUMERIC,
  vram_total_mb NUMERIC,
  ram_used_gb NUMERIC,
  ram_total_gb NUMERIC,
  power_draw_w NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX telemetry_device_time ON public.telemetry_samples(device_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.telemetry_samples TO authenticated;
GRANT ALL ON public.telemetry_samples TO service_role;
ALTER TABLE public.telemetry_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own telemetry" ON public.telemetry_samples FOR SELECT TO authenticated USING (public.owns_device(device_id));

CREATE TABLE public.render_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices ON DELETE CASCADE,
  external_id TEXT,
  project_name TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  current_frame INTEGER NOT NULL DEFAULT 0,
  total_frames INTEGER,
  samples_done INTEGER,
  samples_total INTEGER,
  progress NUMERIC NOT NULL DEFAULT 0,
  eta_seconds INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX render_jobs_device_external ON public.render_jobs(device_id, external_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.render_jobs TO authenticated;
GRANT ALL ON public.render_jobs TO service_role;
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own jobs" ON public.render_jobs FOR SELECT TO authenticated USING (public.owns_device(device_id));

CREATE TABLE public.device_events (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  source TEXT,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_events_device_time ON public.device_events(device_id, created_at DESC);
GRANT SELECT, DELETE ON public.device_events TO authenticated;
GRANT ALL ON public.device_events TO service_role;
ALTER TABLE public.device_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.device_events FOR SELECT TO authenticated USING (public.owns_device(device_id));

CREATE TABLE public.device_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices ON DELETE CASCADE,
  command TEXT NOT NULL,
  target TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  issued_by UUID REFERENCES auth.users ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ
);
CREATE INDEX device_commands_pending ON public.device_commands(device_id, status);
GRANT SELECT, INSERT ON public.device_commands TO authenticated;
GRANT ALL ON public.device_commands TO service_role;
ALTER TABLE public.device_commands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own commands read" ON public.device_commands FOR SELECT TO authenticated USING (public.owns_device(device_id));
CREATE POLICY "own commands insert" ON public.device_commands FOR INSERT TO authenticated WITH CHECK (public.owns_device(device_id) AND issued_by = auth.uid());

CREATE TABLE public.notification_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notification_channels TO authenticated;
GRANT ALL ON public.notification_channels TO service_role;
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own channels" ON public.notification_channels FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.telemetry_samples;
ALTER PUBLICATION supabase_realtime ADD TABLE public.render_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.device_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.devices;
