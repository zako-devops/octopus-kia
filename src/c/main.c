#include <pebble.h>

// Watch UI with explicit charge confirmation. The phone owns credentials and API calls.
typedef enum { DASHBOARD, ACTIONS, PREVIEW, PLAN, RESULT } Screen;
static Window *s_window;
static Layer *s_canvas;
static GBitmap *s_brand_icon;
static Screen s_screen = DASHBOARD;
static int s_choice;
static int s_control_state, s_offer_id, s_offer_target;
static bool s_yes, s_simulation;
static char s_control_text[96] = "Consultando datos...";
static char s_offer_day[24] = "";
static char s_offer_soc[16] = "--", s_offer_extra[16] = "--", s_offer_ready[8] = "--:--";
static AppTimer *s_control_timer;
static int s_soc = -1, s_kia_state, s_octopus_state, s_kia_fresh;
static int s_charger_phase;
static time_t s_schedule_until;
static char s_charger_text[48] = "Esperando a Octopus";
static bool s_loading = true;
static char s_soc_text[16] = "--", s_add_text[16] = "--", s_ready[8] = "--:--";
static char s_plan[512] = "Esperando a Octopus", s_kia_time[40] = "Kia sin fecha";
static char s_note[64] = "Conectando...";
static char s_vehicle_model[25] = "Kia";
static char s_extra[2][16] = {"--", "--"};
static char s_reason[2][64] = {"Necesita datos recientes", "Necesita datos recientes"};
static int s_plan_scroll;
static time_t s_last_update;
static AppTimer *s_notice_timer;
static bool s_notice;
static int s_settings_notice;

static GColor ink(void) { return GColorWhite; }
static GColor muted(void) { return GColorLightGray; }
static GColor accent(void) { return GColorCyan; }
static GColor card(void) { return GColorOxfordBlue; }

static void text(GContext *ctx, const char *value, const char *font,
                 int x, int y, int w, int h, GColor color) {
  graphics_context_set_text_color(ctx, color);
  graphics_draw_text(ctx, value, fonts_get_system_font(font), GRect(x, y, w, h),
                     GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);
}

static void box(GContext *ctx, int x, int y, int w, int h, GColor color, int radius) {
  graphics_context_set_fill_color(ctx, color);
  graphics_fill_rect(ctx, GRect(x, y, w, h), radius, GCornersAll);
}

static int target(void) { return s_choice == 0 ? 80 : 100; }
static const char *reason(int choice) {
  if (!s_last_update || time(NULL) - s_last_update > 5 * 60) return "Actualiza los datos";
  if (choice == 2) return s_charger_phase == 3 ? "Conecta para cargar" : "SELECT: confirmar";
  return s_reason[choice];
}

static void chevron(GContext *ctx, int y, bool up) {
  int sign = up ? 1 : -1;
  graphics_draw_line(ctx, GPoint(184, y + 3 * sign), GPoint(189, y - 2 * sign));
  graphics_draw_line(ctx, GPoint(189, y - 2 * sign), GPoint(194, y + 3 * sign));
}

static void controls(GContext *ctx) {
  box(ctx, 178, 0, 22, 228, card(), 0);
  graphics_context_set_stroke_color(ctx, accent());
  graphics_context_set_stroke_width(ctx, 2);
  if (s_screen == DASHBOARD) {
    // Upper button: refresh information. Lower button: charging plan.
    graphics_draw_circle(ctx, GPoint(189, 45), 5);
    graphics_draw_line(ctx, GPoint(189, 39), GPoint(194, 39));
    graphics_draw_line(ctx, GPoint(194, 39), GPoint(194, 44));
    graphics_context_set_fill_color(ctx, accent());
    for (int dy = -5; dy <= 5; dy += 5) graphics_fill_circle(ctx, GPoint(189, 114 + dy), 1);
    graphics_draw_circle(ctx, GPoint(189, 182), 6);
    graphics_draw_line(ctx, GPoint(189, 182), GPoint(189, 178));
    graphics_draw_line(ctx, GPoint(189, 182), GPoint(192, 184));
  } else if (s_screen == ACTIONS) {
    chevron(ctx, 45, true);
    graphics_draw_line(ctx, GPoint(185, 110), GPoint(191, 114));
    graphics_draw_line(ctx, GPoint(191, 114), GPoint(185, 118));
    chevron(ctx, 182, false);
  } else if (s_screen == PREVIEW && s_control_state == 2) {
    // Select applies the highlighted Sí/No choice on every confirmation screen.
    graphics_draw_line(ctx, GPoint(184, 113), GPoint(188, 117));
    graphics_draw_line(ctx, GPoint(188, 117), GPoint(195, 108));
    chevron(ctx, 45, true);
    chevron(ctx, 182, false);
  } else {
    graphics_draw_line(ctx, GPoint(185, 114), GPoint(193, 114));
    graphics_draw_line(ctx, GPoint(185, 114), GPoint(189, 110));
    graphics_draw_line(ctx, GPoint(185, 114), GPoint(189, 118));
    if (s_screen == PLAN) { chevron(ctx, 45, true); chevron(ctx, 182, false); }
  }
  graphics_context_set_stroke_width(ctx, 1);
}

static void header(GContext *ctx) {
  if (s_brand_icon) {
    graphics_context_set_compositing_mode(ctx, GCompOpSet);
    graphics_draw_bitmap_in_rect(ctx, s_brand_icon, GRect(10, 8, 16, 16));
    graphics_context_set_compositing_mode(ctx, GCompOpAssign);
  }
  text(ctx, "octopus", FONT_KEY_GOTHIC_24_BOLD, s_brand_icon ? 33 : 10, 0,
       s_brand_icon ? 84 : 104, 29, ink());
  GColor phase_color = s_charger_phase == 2 ? GColorGreen :
    s_charger_phase == 3 || s_charger_phase == 4 ? GColorOrange :
    s_charger_phase == 5 || s_charger_phase == 8 ? GColorRed : accent();
  graphics_context_set_stroke_color(ctx, phase_color);
  graphics_context_set_stroke_width(ctx, 2);
  if (s_charger_phase == 2) {
    graphics_draw_line(ctx, GPoint(10, 38), GPoint(13, 41));
    graphics_draw_line(ctx, GPoint(13, 41), GPoint(19, 34));
  } else if (s_charger_phase == 3) {
    // A visible break distinguishes unplugged/away from an API/network error.
    graphics_draw_line(ctx, GPoint(10, 35), GPoint(13, 38));
    graphics_draw_line(ctx, GPoint(16, 41), GPoint(19, 44));
  } else {
    graphics_draw_circle(ctx, GPoint(14, 38), 4);
    graphics_draw_line(ctx, GPoint(14, 38), GPoint(14, 35));
  }
  graphics_context_set_stroke_width(ctx, 1);
  text(ctx, s_charger_text, FONT_KEY_GOTHIC_14_BOLD, 23, 29, 148, 18, phase_color);
  if (s_octopus_state == 1 && s_charger_phase == 1 && s_schedule_until > time(NULL)) {
    graphics_context_set_stroke_color(ctx, GColorGreen);
    graphics_context_set_stroke_width(ctx, 2);
    graphics_draw_circle(ctx, GPoint(129, 18), 6);
    graphics_draw_line(ctx, GPoint(129, 18), GPoint(129, 14));
    graphics_draw_line(ctx, GPoint(129, 18), GPoint(132, 20));
    graphics_context_set_stroke_width(ctx, 1);
    text(ctx, "ON", FONT_KEY_GOTHIC_18_BOLD, 140, 5, 29, 23, GColorGreen);
  }
}

static void dashboard(GContext *ctx) {
  char battery_label[64];
  snprintf(battery_label, sizeof(battery_label), "%s · BATERÍA ACTUAL", s_vehicle_model);
  text(ctx, battery_label, FONT_KEY_GOTHIC_14_BOLD, 11, 48, 156, 20, muted());
  text(ctx, s_soc_text, strlen(s_soc_text) > 4 ? FONT_KEY_GOTHIC_28_BOLD : FONT_KEY_BITHAM_42_BOLD,
       9, 63, 158, 49, ink());
  if (strlen(s_soc_text) <= 3) {
  box(ctx, 133, 83, 27, 16, muted(), 2);
  box(ctx, 160, 88, 3, 6, muted(), 0);
  box(ctx, 135, 85, 23, 12, GColorBlack, 0);
  box(ctx, 137, 87, 12, 8, accent(), 0);
  }
  box(ctx, 11, 116, 155, 5, card(), 2);
  if (s_soc >= 0) box(ctx, 11, 116, 155 * s_soc / 100, 5, accent(), 2);
  box(ctx, 10, 136, 75, 48, card(), 6);
  box(ctx, 91, 136, 76, 48, card(), 6);
  text(ctx, "A AÑADIR", FONT_KEY_GOTHIC_14, 16, 138, 66, 18, muted());
  text(ctx, s_add_text, strlen(s_add_text)>5 ? FONT_KEY_GOTHIC_18_BOLD : FONT_KEY_GOTHIC_24_BOLD, 16, 153, 67, 29, accent());
  text(ctx, "LISTO A LAS", FONT_KEY_GOTHIC_14, 97, 138, 69, 18, muted());
  text(ctx, s_ready, FONT_KEY_GOTHIC_24_BOLD, 97, 153, 68, 29, ink());
  const char *notice = s_settings_notice > 0 ? "Configuración guardada" :
    s_settings_notice < 0 ? "Error de configuración" :
    s_notice ? "Solicitando datos..." : s_note;
  text(ctx, notice,
       FONT_KEY_GOTHIC_14, 11, 188, 157, 20, muted());
  text(ctx, s_kia_time, FONT_KEY_GOTHIC_14, 11, 207, 155, 20, muted());
}

static void actions(GContext *ctx) {
  text(ctx, "Acciones", FONT_KEY_GOTHIC_24_BOLD, 10, 47, 157, 30, ink());
  for (int i = 0; i < 3; i++) {
    int y = 78 + i * 44;
    int goal = i == 0 ? 80 : 100;
    GColor fill = s_choice == i ? GColorPurple : card();
    box(ctx, 10, y, 157, 40, fill, 7);
    if (s_choice == i) box(ctx, 10, y + 6, 3, 28, accent(), 1);
    char label[32];
    if (i == 2) {
      text(ctx, s_charger_phase == 6 ? "Detener carga" : "Forzar carga ahora", FONT_KEY_GOTHIC_18_BOLD, 21, y - 2, 140, 25, ink());
      snprintf(label, sizeof(label), "%s", s_charger_phase == 6 ? "Volver al plan horario" : "Requiere coche conectado");
    } else {
      snprintf(label, sizeof(label), "%d%%", goal);
      text(ctx, label, FONT_KEY_GOTHIC_24_BOLD, 21, y - 5, 140, 29, ink());
      snprintf(label, sizeof(label), "%.15s a añadir", s_extra[i]);
    }
    text(ctx, label, FONT_KEY_GOTHIC_14, 22, y + 20, 138, 20, ink());
  }
  text(ctx, *reason(s_choice) ? reason(s_choice) : "SELECT: confirmar",
       FONT_KEY_GOTHIC_14_BOLD, 11, 209, 156, 18, accent());
}

static void preview(GContext *ctx) {
  if (s_control_state != 2) {
    text(ctx, s_control_text, FONT_KEY_GOTHIC_24_BOLD, 11, 65, 156, 95, ink());
    text(ctx, s_control_state == 3 ? "Espera al resultado" : "BACK: cancelar",
         FONT_KEY_GOTHIC_14, 11, 183, 156, 20, muted());
    return;
  }
  if (s_offer_target <= 0) {
    bool stopping = s_offer_target == -1;
    text(ctx, stopping ? "¿Detener carga?" : "¿Estás seguro?", FONT_KEY_GOTHIC_24_BOLD, 10, 48, 158, 34, ink());
    text(ctx, stopping ? "Detener carga forzada" : "Forzar carga ahora", FONT_KEY_GOTHIC_18_BOLD, 11, 86, 157, 27, accent());
    text(ctx, stopping ? "Volver al plan horario\nSin cambiar preferencias" : "Hasta el límite del coche\nFuera del plan horario", FONT_KEY_GOTHIC_14, 11, 116, 157, 38, muted());
  } else {
  text(ctx, "¿Quieres enviar la nueva configuración?", FONT_KEY_GOTHIC_18_BOLD,
       10, 47, 158, 58, ink());
  char label[64];
  snprintf(label, sizeof(label), "%s → %d%% · %s", s_offer_soc, s_offer_target, s_offer_extra);
  text(ctx, label, FONT_KEY_GOTHIC_18_BOLD, 11, 106, 157, 25, accent());
  snprintf(label, sizeof(label), "Listo a las %s", s_offer_ready);
  text(ctx, label, FONT_KEY_GOTHIC_18, 11, 130, 157, 24, muted());
  }
  box(ctx, 10, 159, 157, 24, s_yes ? GColorPurple : card(), 4);
  text(ctx, "Sí", FONT_KEY_GOTHIC_18_BOLD, 20, 157, 137, 25, ink());
  box(ctx, 10, 187, 157, 24, !s_yes ? GColorPurple : card(), 4);
  text(ctx, "No", FONT_KEY_GOTHIC_18_BOLD, 20, 185, 137, 25, ink());
  text(ctx, strncmp(s_control_text, "Datos", 5) == 0 ? "Datos nuevos · revisa" : "SELECT: confirmar",
       FONT_KEY_GOTHIC_14, 11, 211, 157, 17, muted());
}

static void result(GContext *ctx) {
  const char *title = s_control_state == 4 ? (strncmp(s_control_text, "Carga forzada", 13) == 0 ? "Carga detenida" : strncmp(s_control_text, "Carga inmediata", 15) == 0 ? "Carga inmediata" : "Guardado") :
    s_control_state == 6 ? "Revisar resultado" : "No enviado";
  text(ctx, title, FONT_KEY_GOTHIC_24_BOLD, 10, 52, 158, 35,
       s_control_state == 4 ? GColorGreen : GColorOrange);
  text(ctx, s_control_text, FONT_KEY_GOTHIC_18_BOLD, 11, 96, 155, 91, ink());
  text(ctx, "SELECT: volver", FONT_KEY_GOTHIC_14, 11, 207, 157, 20, muted());
}

static void plan(GContext *ctx) {
  bool state_view = s_charger_phase == 2 || s_charger_phase == 3 || s_charger_phase == 4 ||
    s_charger_phase == 5 || s_charger_phase == 7 || s_charger_phase == 8;
  text(ctx, state_view ? "Estado V2C" : "Plan nocturno", FONT_KEY_GOTHIC_24_BOLD, 10, 47, 158, 31, ink());
  const char *subtitle = s_charger_phase == 3 ? "CONEXIÓN EN CASA" :
    state_view ? "CONTROL INTELIGENTE" : "FECHA · HORA MADRID";
  text(ctx, subtitle, FONT_KEY_GOTHIC_14, 11, 79, 155, 20, muted());
  const char *line = s_plan;
  int number = 0, row = 0;
  while (*line && row < 4) {
    const char *end = strchr(line, '\n');
    size_t length = end ? (size_t)(end - line) : strlen(line);
    if (number++ >= s_plan_scroll) {
      char label[64];
      snprintf(label, sizeof(label), "%.*s", (int)length, line);
      box(ctx, 10, 105 + 25*row, 157, 23, card(), 4);
      text(ctx, label, FONT_KEY_GOTHIC_18_BOLD, 14, 103 + 25*row, 151, 24, ink());
      row++;
    }
    if (!end) break;
    line = end + 1;
  }
  const char *footer = s_charger_phase == 2 ? "Preferencias guardadas" :
    s_charger_phase == 3 ? "Conecta para cargar" : "Octopus elige las horas";
  text(ctx, footer, FONT_KEY_GOTHIC_14, 11, 207, 157, 20, muted());
}

static void draw(Layer *layer, GContext *ctx) {
  (void)layer;
  box(ctx, 0, 0, 200, 228, GColorBlack, 0);
  header(ctx);
  switch (s_screen) {
    case DASHBOARD: dashboard(ctx); break;
    case ACTIONS: actions(ctx); break;
    case PREVIEW: preview(ctx); break;
    case PLAN: plan(ctx); break;
    case RESULT: result(ctx); break;
  }
  controls(ctx);
  if (s_simulation) {
    box(ctx, 0, 211, 178, 17, GColorBlack, 0);
    text(ctx, "SIMULACIÓN · sin cambios", FONT_KEY_GOTHIC_14_BOLD, 7, 209, 168, 19, GColorOrange);
  }
}

static void show(Screen screen) {
  s_screen = screen;
  layer_mark_dirty(s_canvas);
  APP_LOG(APP_LOG_LEVEL_INFO, "UI screen=%d choice=%d", screen, s_choice);
}

static void clear_notice(void *context) {
  (void)context;
  s_notice_timer = NULL;
  s_notice = false;
  s_settings_notice = 0;
  layer_mark_dirty(s_canvas);
}

static void refresh(void) {
  DictionaryIterator *iterator;
  if (app_message_outbox_begin(&iterator) == APP_MSG_OK) {
    dict_write_uint8(iterator, MESSAGE_KEY_REFRESH, 1);
    app_message_outbox_send();
  }
}

static void control_timeout(void *context) {
  (void)context; s_control_timer = NULL;
  if (s_screen != PREVIEW || (s_control_state != 1 && s_control_state != 3)) return;
  s_control_state = s_control_state == 3 ? 6 : 5;
  snprintf(s_control_text, sizeof(s_control_text), "%s", s_control_state == 6 ?
           "Sin respuesta.\nRevisa Octopus" : "El teléfono no responde");
  s_offer_id = 0; show(RESULT);
}

static bool command(uint32_t key, int value) {
  DictionaryIterator *iterator;
  if (app_message_outbox_begin(&iterator) != APP_MSG_OK) return false;
  dict_write_int32(iterator, key, value);
  return app_message_outbox_send() == APP_MSG_OK;
}

static void wait_control(int state, const char *message) {
  s_control_state = state;
  snprintf(s_control_text, sizeof(s_control_text), "%s", message);
  if (s_control_timer) app_timer_cancel(s_control_timer);
  s_control_timer = app_timer_register(45000, control_timeout, NULL);
  show(PREVIEW);
}

static void up(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (s_screen == PREVIEW && s_control_state == 2) { s_yes = true; layer_mark_dirty(s_canvas); }
  else if (s_screen == ACTIONS) { if (s_choice > 0) s_choice--; show(ACTIONS); }
  else if (s_screen == PLAN && s_plan_scroll > 0) { s_plan_scroll--; layer_mark_dirty(s_canvas); }
  else if (s_screen == DASHBOARD) {
    s_notice = true;
    if (s_notice_timer) app_timer_cancel(s_notice_timer);
    s_notice_timer = app_timer_register(1500, clear_notice, NULL);
    layer_mark_dirty(s_canvas);
    refresh();
  }
}

static void down(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (s_screen == PREVIEW && s_control_state == 2) { s_yes = false; layer_mark_dirty(s_canvas); }
  else if (s_screen == ACTIONS) { if (s_choice < 2) s_choice++; show(ACTIONS); }
  else if (s_screen == DASHBOARD) { s_plan_scroll = 0; show(PLAN); }
  else if (s_screen == PLAN) {
    int lines = 1;
    for (const char *p = s_plan; *p; p++) if (*p == '\n') lines++;
    if (s_plan_scroll + 4 < lines) { s_plan_scroll++; layer_mark_dirty(s_canvas); }
  }
}

static void select(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (s_screen == DASHBOARD) show(ACTIONS);
  else if (s_screen == ACTIONS) {
    bool stopping = s_choice == 2 && s_charger_phase == 6;
    s_offer_id = 0; s_yes = false; s_offer_target = s_choice == 2 ? (stopping ? -1 : 0) : target();
    wait_control(1, "Consultando datos...");
    if (!command(s_choice == 2 ? (stopping ? MESSAGE_KEY_PREPARE_STOP_BOOST : MESSAGE_KEY_PREPARE_BOOST) : MESSAGE_KEY_PREPARE_TARGET, s_choice == 2 ? 1 : target())) {
      app_timer_cancel(s_control_timer); s_control_timer = NULL; control_timeout(NULL);
    }
  } else if (s_screen == PREVIEW && s_control_state == 2) {
    if (!s_yes) { command(MESSAGE_KEY_CANCEL_OFFER, 1); s_offer_id = 0; show(ACTIONS); }
    else if (s_offer_id > 0) {
      int id = s_offer_id; s_offer_id = 0;
      wait_control(3, "Comprobando datos...");
      if (!command(MESSAGE_KEY_CONFIRM_OFFER, id)) {
        app_timer_cancel(s_control_timer); s_control_timer = NULL; control_timeout(NULL);
      }
    }
  } else if (s_screen != PREVIEW) show(DASHBOARD);
}

static void back(ClickRecognizerRef recognizer, void *context) {
  (void)recognizer; (void)context;
  if (s_screen == DASHBOARD) window_stack_pop(true);
  else if (s_screen == PREVIEW && s_control_state == 3) return;
  else {
    if (s_screen == PREVIEW) {command(MESSAGE_KEY_CANCEL_OFFER, 1);s_offer_id = 0;}
    show(s_screen == PREVIEW ? ACTIONS : DASHBOARD);
  }
}

static void clicks(void *context) {
  (void)context;
  window_single_click_subscribe(BUTTON_ID_UP, up);
  window_single_click_subscribe(BUTTON_ID_DOWN, down);
  window_single_click_subscribe(BUTTON_ID_SELECT, select);
  window_single_click_subscribe(BUTTON_ID_BACK, back);
}

static void inbox(DictionaryIterator *iterator, void *context) {
  (void)context;
  Tuple *saved = dict_find(iterator, MESSAGE_KEY_SETTINGS_SAVED);
  if (saved && saved->value->int32 != 0 && s_canvas) {
    s_settings_notice = saved->value->int32;
    if (s_notice_timer) app_timer_cancel(s_notice_timer);
    s_notice_timer = app_timer_register(4000, clear_notice, NULL);
    show(DASHBOARD);
  }
  Tuple *tuple;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_LOADING))) {
    s_loading = tuple->value->int32 != 0;
    s_last_update = time(NULL);
  }
  if ((tuple = dict_find(iterator, MESSAGE_KEY_KIA_STATE))) s_kia_state = tuple->value->int32;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_KIA_FRESH))) s_kia_fresh = tuple->value->int32;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_OCTOPUS_STATE))) s_octopus_state = tuple->value->int32;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_CHARGER_PHASE))) s_charger_phase = tuple->value->int32;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_SCHEDULE_UNTIL))) s_schedule_until = tuple->value->int32;
  if ((tuple = dict_find(iterator, MESSAGE_KEY_SOC))) s_soc = tuple->value->int32;
#define READ_TEXT(KEY, DEST) do { \
  tuple = dict_find(iterator, MESSAGE_KEY_##KEY); \
  if (tuple && tuple->type == TUPLE_CSTRING) snprintf(DEST, sizeof(DEST), "%s", tuple->value->cstring); \
} while (0)
  READ_TEXT(SOC_TEXT, s_soc_text); READ_TEXT(ADD_TEXT, s_add_text); READ_TEXT(READY, s_ready);
  READ_TEXT(PLAN_TEXT, s_plan); s_plan_scroll = 0;
  READ_TEXT(KIA_TIME, s_kia_time); READ_TEXT(NOTE, s_note);
  READ_TEXT(VEHICLE_MODEL, s_vehicle_model);
  READ_TEXT(EXTRA_80, s_extra[0]); READ_TEXT(EXTRA_100, s_extra[1]);
  READ_TEXT(REASON_80, s_reason[0]); READ_TEXT(REASON_100, s_reason[1]);
  if ((tuple = dict_find(iterator, MESSAGE_KEY_SIMULATION))) s_simulation = tuple->value->int32 != 0;
  if ((s_screen == PREVIEW || (s_screen == RESULT && s_control_state == 6)) &&
      (tuple = dict_find(iterator, MESSAGE_KEY_CONTROL_STATE))) {
    s_control_state = tuple->value->int32;
    if ((tuple = dict_find(iterator, MESSAGE_KEY_OFFER_ID))) s_offer_id = tuple->value->int32;
    if ((tuple = dict_find(iterator, MESSAGE_KEY_OFFER_TARGET))) s_offer_target = tuple->value->int32;
    READ_TEXT(CONTROL_TEXT, s_control_text); READ_TEXT(OFFER_SOC, s_offer_soc);
    READ_TEXT(OFFER_EXTRA, s_offer_extra); READ_TEXT(OFFER_READY, s_offer_ready);
    READ_TEXT(OFFER_DAY, s_offer_day);
    if (s_control_state == 2 || s_control_state >= 4) {
      if (s_control_timer) {app_timer_cancel(s_control_timer);s_control_timer = NULL;}
      s_yes = false;
      if (s_control_state == 2) show(PREVIEW);
      if (s_control_state >= 4) show(RESULT);
    }
  }
  READ_TEXT(CHARGER_TEXT, s_charger_text);
#undef READ_TEXT
  if (s_canvas) layer_mark_dirty(s_canvas);
}

static void load(Window *window) {
  s_brand_icon = gbitmap_create_with_resource(RESOURCE_ID_OCTOPUS_LOGO);
  s_canvas = layer_create(layer_get_bounds(window_get_root_layer(window)));
  layer_set_update_proc(s_canvas, draw);
  layer_add_child(window_get_root_layer(window), s_canvas);
}

static void unload(Window *window) {
  (void)window;
  if (s_notice_timer) { app_timer_cancel(s_notice_timer); s_notice_timer = NULL; }
  if (s_control_timer) {app_timer_cancel(s_control_timer);s_control_timer = NULL;}
  layer_destroy(s_canvas);
  s_canvas = NULL;
  if (s_brand_icon) { gbitmap_destroy(s_brand_icon); s_brand_icon = NULL; }
}

static void minute_tick(struct tm *tick_time, TimeUnits units_changed) {
  (void)tick_time; (void)units_changed;
  if (s_canvas) layer_mark_dirty(s_canvas);
}

int main(void) {
  s_window = window_create();
  window_set_background_color(s_window, GColorBlack);
  window_set_click_config_provider(s_window, clicks);
  window_set_window_handlers(s_window, (WindowHandlers){ .load = load, .unload = unload });
  window_stack_push(s_window, true);
  app_message_register_inbox_received(inbox);
  app_message_open(2048, 128);
  tick_timer_service_subscribe(MINUTE_UNIT, minute_tick);
  app_event_loop();
  tick_timer_service_unsubscribe();
  window_destroy(s_window);
}
