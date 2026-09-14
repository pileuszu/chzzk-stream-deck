-- Only the A1 source is controlled. No network, recording or streaming commands.
local obs = obslua
local M = {}
local last_id, last_ok, last_error = '', true, ''
local function get_source()
    local list = obs.obs_enum_sources()
    local found, count = nil, 0
    if list then
        for _, source in ipairs(list) do
            if obs.obs_source_get_id(source) == 'a1_local_sync' then
                count = count + 1
                if not found then found = obs.obs_source_get_ref(source) end
            end
        end
        obs.source_list_release(list)
    end
    if count ~= 1 and found then obs.obs_source_release(found); found = nil end
    return found
end
local function saved_path(settings)
    local current = obs.obs_data_get_string(settings, 'config_path')
    if current ~= '' then return current end
    return obs.obs_data_get_string(settings, 'deck_config_path')
end
local function handle(command, source)
    if not source then return false, 'A1 Local 소스를 하나만 연결해 주세요.' end
    local action = obs.obs_data_get_string(command, 'action')
    if action ~= 'start' and action ~= 'stop' and action ~= 'apply' then return false, 'Unsupported capture command' end
    local settings = obs.obs_source_get_settings(source)
    local config = saved_path(settings)
    if config == '' then obs.obs_data_release(settings); return false, 'A1 구성 파일을 선택해 주세요.' end
    if action == 'apply' and obs.obs_data_get_string(settings, 'config_path') == '' then
        obs.obs_data_release(settings); return false, '중지된 캡처에는 시작을 눌러 설정을 적용하세요.'
    end
    if action ~= 'stop' then
        local folder = config:match('^(.*[/\\])')
        local candidate = folder and folder .. 'local-capture.ini' or nil
        local file = candidate and io.open(candidate, 'r') or nil
        if file then file:close(); config = candidate end
    end
    obs.obs_data_set_string(settings, 'deck_config_path', config)
    obs.obs_data_set_string(settings, 'config_path', action == 'stop' and '' or config)
    obs.obs_data_set_bool(settings, 'test_pattern', false)
    obs.obs_source_update(source, settings)
    obs.obs_data_release(settings)
    obs.obs_frontend_save()
    return true, ''
end
function M.poll(root)
    local source = get_source()
    local file = io.open(root .. 'deck-control-command.json', 'r')
    if file then
        local raw = file:read(8193)
        file:close()
        os.remove(root .. 'deck-control-command.json')
        local command = #raw <= 8192 and obs.obs_data_create_from_json(raw) or nil
        if command then
            local id = obs.obs_data_get_string(command, 'id')
            local valid = obs.obs_data_get_int(command, 'version') == 1 and #id <= 64 and id:match('^[%w%-]+$')
            if valid and id ~= last_id then
                last_id = id
                if obs.obs_data_get_double(command, 'expires_at') < os.time() * 1000 then
                    last_ok, last_error = false, '만료된 캡처 명령입니다. 다시 시도해 주세요.'
                else
                    last_ok, last_error = handle(command, source)
                end
            end
            obs.obs_data_release(command)
        end
    end
    local state = obs.obs_data_create()
    obs.obs_data_set_int(state, 'version', 1)
    obs.obs_data_set_bool(state, 'source_present', source ~= nil)
    obs.obs_data_set_string(state, 'request_id', last_id)
    obs.obs_data_set_bool(state, 'ok', last_ok)
    obs.obs_data_set_string(state, 'error', last_error)
    obs.obs_data_set_bool(state, 'recording', obs.obs_frontend_recording_active())
    obs.obs_data_set_bool(state, 'streaming', obs.obs_frontend_streaming_active())
    if source then
        local settings = obs.obs_source_get_settings(source)
        obs.obs_data_set_string(state, 'config_path', saved_path(settings))
        obs.obs_data_set_bool(state, 'capture_requested', obs.obs_data_get_string(settings, 'config_path') ~= '')
        obs.obs_data_release(settings)
        obs.obs_source_release(source)
    end
    obs.obs_data_save_json_safe(state, root .. 'deck-control-status.json', 'tmp', 'bak')
    obs.obs_data_release(state)
end
return M
