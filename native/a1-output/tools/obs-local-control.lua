-- Optional local validation controls. Never starts an Internet stream.
obs = obslua
local root = script_path() .. '../logs/'
local source_name = 'A1 Desktop + Audio'
local empty_source_probe_ok = nil
local deck_control = dofile(script_path() .. 'deck-local-control.lua')

local function source_update(test)
    local source = obs.obs_get_source_by_name(source_name)
    if source then
        local settings = obs.obs_source_get_settings(source)
        obs.obs_data_set_bool(settings, 'test_pattern', test)
        obs.obs_source_update(source, settings)
        obs.obs_data_release(settings)
        obs.obs_source_release(source)
        obs.obs_frontend_save()
    end
end
local function poll()
    deck_control.poll(root)
    local f = io.open(root .. 'obs-command.txt', 'r')
    if f then
        local command = f:read('*a'):gsub('%s+$', '')
        f:close()
        os.remove(root .. 'obs-command.txt')
        if command == 'record_start' and not obs.obs_frontend_recording_active() then
            obs.obs_frontend_recording_start()
        elseif command == 'record_stop' and obs.obs_frontend_recording_active() then
            obs.obs_frontend_recording_stop()
        elseif command == 'test_on' then source_update(true)
        elseif command == 'test_off' then source_update(false)
        elseif command == 'screenshot' then
            local source = obs.obs_get_source_by_name(source_name)
            if source then obs.obs_frontend_take_source_screenshot(source);obs.obs_source_release(source) end
        elseif command == 'probe_empty_source' then
            local settings = obs.obs_data_create()
            local source = obs.obs_source_create('a1_local_sync', 'A1 Empty Config Check', settings, nil)
            empty_source_probe_ok = source ~= nil
            if source then obs.obs_source_release(source) end
            obs.obs_data_release(settings)
        elseif command == 'save' then obs.obs_frontend_save()
        end
    end
    local state = obs.obs_data_create()
    obs.obs_data_set_bool(state, 'recording', obs.obs_frontend_recording_active())
    obs.obs_data_set_bool(state, 'streaming', obs.obs_frontend_streaming_active())
    if empty_source_probe_ok ~= nil then obs.obs_data_set_bool(state, 'empty_source_probe_ok', empty_source_probe_ok) end
    local path = obs.obs_frontend_get_last_recording()
    if path then obs.obs_data_set_string(state, 'last_recording', path) end
    local source = obs.obs_get_source_by_name(source_name)
    if source then
        obs.obs_data_set_int(state, 'width', obs.obs_source_get_width(source))
        obs.obs_data_set_int(state, 'height', obs.obs_source_get_height(source))
        obs.obs_data_set_int(state, 'sync_ns', obs.obs_source_get_sync_offset(source))
        obs.obs_data_set_int(state, 'monitoring', obs.obs_source_get_monitoring_type(source))
        local settings = obs.obs_source_get_settings(source)
        obs.obs_data_set_bool(state, 'test_pattern', obs.obs_data_get_bool(settings, 'test_pattern'))
        obs.obs_data_release(settings)
        obs.obs_source_release(source)
    end
    obs.obs_data_save_json_safe(state, root .. 'obs-control-status.json', 'tmp', 'bak')
    obs.obs_data_release(state)
end
function script_description() return 'Local capture verification. Commands in logs/obs-command.txt; recording and screenshots stay on this PC.' end
function script_load(settings) obs.timer_add(poll, 500) end
function script_unload() obs.timer_remove(poll) end
