use std::env;
use std::fs;
use std::path::Path;
use std::sync::{
    Arc,
    mpsc::{self, Receiver, Sender},
};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Result, anyhow};
use iced::widget::{button, checkbox, column, container, row, scrollable, text, text_input};
use iced::{
    Alignment, Background, Border, Color, Element, Length, Padding, Shadow, Size, Subscription,
    Task, Vector, time, window,
};
use tray_icon::menu::{Menu, MenuEvent, MenuItem};
use tray_icon::{
    Icon as TrayIconImage, MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent,
    TrayIconId,
};

use crate::lifecycle::{
    LifecycleCommand, LifecycleMachine, SharedLifecycleState, WindowModeState,
    current_policy_from_settings, new_shared_lifecycle_state, sync_launch_on_startup,
    write_shared_lifecycle_state,
};
use crate::mqtt::{MqttRuntimeHandle, RuntimeEvent, probe_connection, start_runtime};
use crate::settings::{UiLanguage, YeonjangSettings, load_settings, save_settings};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ActiveTab {
    Connection,
    ExtensionInfo,
    Permissions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ConnectionState {
    Disconnected,
    Connected,
    AuthFailed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum TrayAction {
    ShowWindow,
    HideWindow,
    QuitApp,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum PermissionField {
    SystemControl,
    ShellExec,
    ApplicationLaunch,
    ScreenCapture,
    KeyboardControl,
    MouseControl,
}

#[derive(Debug, Clone)]
enum Message {
    Tick,
    WindowCloseRequested(window::Id),
    SelectTab(ActiveTab),
    SetLanguage(UiLanguage),
    HostChanged(String),
    PortChanged(String),
    UsernameChanged(String),
    PasswordChanged(String),
    DisplayNameChanged(String),
    ToggleAutoConnect(bool),
    ToggleLaunchOnStartup(bool),
    TogglePermission(PermissionField, bool),
    CheckConnection,
    Connect,
    Disconnect,
    Save,
    Reload,
    CancelChanges,
    RestoreDefaults,
    RegenerateExtensionId,
    CopyExtensionId,
    Copied,
}

struct SystemTrayController {
    _tray_icon: TrayIcon,
    show_item: MenuItem,
    hide_item: MenuItem,
    connection_item: MenuItem,
    permission_item: MenuItem,
    version_item: MenuItem,
    receiver: Receiver<TrayAction>,
}

impl SystemTrayController {
    fn new(lang: UiLanguage) -> Result<Self> {
        let menu = Menu::new();
        let settings_item = MenuItem::new(t(lang, "창 열기", "Open Window"), true, None);
        let hide_item = MenuItem::new(t(lang, "숨기기", "Hide"), true, None);
        let connection_item = MenuItem::new(
            t(lang, "연결 상태: 확인 중", "Connection: pending"),
            false,
            None,
        );
        let permission_item = MenuItem::new(
            t(lang, "권한 상태: 확인 중", "Permissions: pending"),
            false,
            None,
        );
        let version_item = MenuItem::new(
            format!(
                "{} {}",
                t(lang, "버전", "Version"),
                env!("CARGO_PKG_VERSION")
            ),
            false,
            None,
        );
        let quit_item = MenuItem::new(t(lang, "종료", "Quit"), true, None);

        menu.append(&settings_item)?;
        menu.append(&hide_item)?;
        menu.append(&connection_item)?;
        menu.append(&permission_item)?;
        menu.append(&version_item)?;
        menu.append(&quit_item)?;

        let tray_icon = TrayIconBuilder::new()
            .with_id("yeonjang-main-tray")
            .with_tooltip("Yeonjang")
            .with_icon(build_tray_icon()?)
            .with_menu(Box::new(menu))
            .build()?;
        let tray_icon_id = tray_icon.id().clone();

        let settings_id = settings_item.id().clone();
        let hide_id = hide_item.id().clone();
        let quit_id = quit_item.id().clone();
        let (sender, receiver) = mpsc::channel();
        install_tray_menu_handler(sender.clone(), settings_id, hide_id, quit_id);
        install_tray_icon_handler(sender, tray_icon_id.clone());

        Ok(Self {
            _tray_icon: tray_icon,
            show_item: settings_item,
            hide_item,
            connection_item,
            permission_item,
            version_item,
            receiver,
        })
    }

    fn drain_actions(&self) -> Vec<TrayAction> {
        let mut actions = Vec::new();
        while let Ok(action) = self.receiver.try_recv() {
            actions.push(action);
        }
        actions
    }

    fn sync_state(
        &self,
        lang: UiLanguage,
        connection_state: ConnectionState,
        permission_counts: (usize, usize, usize),
        window_visible: bool,
    ) {
        let (enabled, disabled, os_required) = permission_counts;
        let connection_text = format!(
            "{}: {}",
            t(lang, "연결 상태", "Connection"),
            connection_state_label(lang, connection_state),
        );
        let permission_text = format!(
            "{}: {} {}, {} {}, {} {}",
            t(lang, "권한 상태", "Permissions"),
            t(lang, "허용", "On"),
            enabled,
            t(lang, "꺼짐", "Off"),
            disabled,
            t(lang, "OS 승인", "OS Approval"),
            os_required,
        );
        let version_text = format!(
            "{} {}",
            t(lang, "버전", "Version"),
            env!("CARGO_PKG_VERSION"),
        );

        self.show_item.set_text(t(lang, "창 열기", "Open Window"));
        self.hide_item.set_text(t(lang, "숨기기", "Hide"));
        self.connection_item.set_text(connection_text);
        self.permission_item.set_text(permission_text);
        self.version_item.set_text(version_text);
        self.show_item.set_enabled(!window_visible);
        self.hide_item.set_enabled(window_visible);
        self.connection_item.set_enabled(false);
        self.permission_item.set_enabled(false);
        self.version_item.set_enabled(false);
    }
}

fn install_tray_menu_handler(
    sender: Sender<TrayAction>,
    settings_id: tray_icon::menu::MenuId,
    hide_id: tray_icon::menu::MenuId,
    quit_id: tray_icon::menu::MenuId,
) {
    MenuEvent::set_event_handler(Some(move |event: tray_icon::menu::MenuEvent| {
        let action = if event.id == settings_id {
            Some(TrayAction::ShowWindow)
        } else if event.id == hide_id {
            Some(TrayAction::HideWindow)
        } else if event.id == quit_id {
            Some(TrayAction::QuitApp)
        } else {
            None
        };

        if let Some(action) = action {
            let _ = sender.send(action);
        }
    }));
}

fn install_tray_icon_handler(sender: Sender<TrayAction>, tray_icon_id: TrayIconId) {
    TrayIconEvent::set_event_handler(Some(move |event| {
        let show = match event {
            TrayIconEvent::DoubleClick { id, button, .. } => {
                id == tray_icon_id && button == MouseButton::Left
            }
            TrayIconEvent::Click {
                id,
                button,
                button_state,
                ..
            } => {
                cfg!(target_os = "macos")
                    && id == tray_icon_id
                    && button == MouseButton::Left
                    && button_state == MouseButtonState::Up
            }
            _ => false,
        };

        if show {
            let _ = sender.send(TrayAction::ShowWindow);
        }
    }));
}

fn t(lang: UiLanguage, ko: &'static str, en: &'static str) -> &'static str {
    match lang {
        UiLanguage::Ko => ko,
        UiLanguage::En => en,
    }
}

pub fn run_gui() -> Result<()> {
    let initial_window_visible = load_settings()
        .map(|settings| {
            current_policy_from_settings(&settings).initial_window_mode == WindowModeState::Visible
        })
        .unwrap_or(true);
    let mut app = iced::application(
        YeonjangGuiApp::new,
        YeonjangGuiApp::update,
        YeonjangGuiApp::view,
    )
    .title(YeonjangGuiApp::title)
    .subscription(YeonjangGuiApp::subscription)
    .window(window::Settings {
        size: Size::new(680.0, 760.0),
        min_size: Some(Size::new(680.0, 760.0)),
        max_size: Some(Size::new(680.0, 760.0)),
        resizable: false,
        exit_on_close_request: false,
        visible: initial_window_visible,
        icon: build_window_icon().ok(),
        ..window::Settings::default()
    });

    if let Some((_, bytes)) = load_ui_font() {
        app = app.font(bytes);
    }

    app.run().map_err(|error| anyhow!(error.to_string()))?;
    Ok(())
}

struct YeonjangGuiApp {
    settings: YeonjangSettings,
    saved_settings: YeonjangSettings,
    port_input: String,
    status_message: String,
    active_tab: ActiveTab,
    connection_state: ConnectionState,
    connection_attempted: bool,
    last_error: String,
    mqtt_runtime: Option<MqttRuntimeHandle>,
    mqtt_runtime_events: Option<Receiver<RuntimeEvent>>,
    tray_controller: Option<SystemTrayController>,
    lifecycle: LifecycleMachine,
    lifecycle_state: SharedLifecycleState,
    pending_lifecycle_command: Option<LifecycleCommand>,
    quit_in_progress: bool,
}

impl YeonjangGuiApp {
    fn new() -> Self {
        let (settings, status_message) = match load_settings() {
            Ok(settings) => {
                let lang = settings.ui_language;
                (
                    settings,
                    t(lang, "설정을 불러왔습니다.", "Settings loaded.").to_string(),
                )
            }
            Err(error) => {
                let settings = YeonjangSettings::default();
                let lang = settings.ui_language;
                (
                    settings,
                    format!(
                        "{}: {error}",
                        t(
                            lang,
                            "설정을 읽지 못해 기본값으로 시작했습니다",
                            "Failed to read settings. Started with defaults"
                        )
                    ),
                )
            }
        };
        let ui_language = settings.ui_language;
        let policy = current_policy_from_settings(&settings);
        let mut lifecycle = LifecycleMachine::new(policy, false);
        let mut tray_controller = None;
        let mut pending_lifecycle_command = None;

        let mut app = Self {
            saved_settings: settings.clone(),
            port_input: settings.connection.port.to_string(),
            settings,
            status_message,
            active_tab: ActiveTab::Connection,
            connection_state: ConnectionState::Disconnected,
            connection_attempted: false,
            last_error: t(
                ui_language,
                "아직 연결하지 않았습니다.",
                "Not connected yet.",
            )
            .to_string(),
            mqtt_runtime: None,
            mqtt_runtime_events: None,
            tray_controller: None,
            lifecycle_state: new_shared_lifecycle_state(lifecycle.state()),
            lifecycle: lifecycle.clone(),
            pending_lifecycle_command: None,
            quit_in_progress: false,
        };

        match SystemTrayController::new(ui_language) {
            Ok(controller) => {
                lifecycle.sync_tray_availability(true);
                tray_controller = Some(controller);
            }
            Err(error) => {
                app.set_status(format!(
                    "{}: {error}",
                    t(
                        ui_language,
                        "시스템 트레이 초기화 실패",
                        "Failed to initialize the system tray"
                    )
                ));
                if lifecycle.expects_tray() && !lifecycle.initial_window_visible() {
                    pending_lifecycle_command = Some(lifecycle.force_foreground_fallback());
                }
            }
        }

        app.lifecycle = lifecycle;
        app.tray_controller = tray_controller;
        app.pending_lifecycle_command = pending_lifecycle_command;
        app.sync_lifecycle_registration();
        app.sync_tray_menu();

        if app.settings.connection.auto_connect {
            app.connect_now();
        }

        app
    }

    fn lang(&self) -> UiLanguage {
        self.settings.ui_language
    }

    fn title(&self) -> String {
        format!(
            "Yeonjang - {}",
            match self.connection_state {
                ConnectionState::Connected => t(self.lang(), "연결됨", "Connected"),
                ConnectionState::Disconnected => t(self.lang(), "연결 안 됨", "Offline"),
                ConnectionState::AuthFailed => t(self.lang(), "인증 실패", "Auth Failed"),
            }
        )
    }

    fn update(&mut self, message: Message) -> Task<Message> {
        match message {
            Message::Tick => {
                self.process_runtime_events();
                let mut tasks = Vec::new();
                self.sync_tray_menu();

                if let Some(command) = self.pending_lifecycle_command.take() {
                    tasks.push(self.apply_lifecycle_command(command, "startup-ready"));
                }

                for action in self.drain_tray_actions() {
                    match action {
                        TrayAction::ShowWindow => {
                            self.set_status(t(
                                self.lang(),
                                "트레이에서 창을 열었습니다.",
                                "Opened the window from the tray.",
                            ));
                            let command = self.lifecycle.show_window();
                            tasks.push(self.apply_lifecycle_command(command, "window-visible"));
                        }
                        TrayAction::HideWindow => {
                            self.set_status(t(
                                self.lang(),
                                "Yeonjang을 트레이로 숨겼습니다.",
                                "Yeonjang was hidden to the tray.",
                            ));
                            let command = self.lifecycle.hide_window();
                            tasks.push(self.apply_lifecycle_command(command, "window-hidden"));
                        }
                        TrayAction::QuitApp => {
                            self.set_status(t(
                                self.lang(),
                                "Yeonjang을 종료합니다.",
                                "Quitting Yeonjang.",
                            ));
                            tasks.push(
                                self.apply_lifecycle_command(self.lifecycle.quit(), "quitting"),
                            );
                        }
                    }
                }

                Task::batch(tasks)
            }
            Message::WindowCloseRequested(_id) => {
                if self.quit_in_progress {
                    return window_command(WindowCommand::Quit);
                }
                let command = self.lifecycle.handle_close_request();
                self.set_status(t(
                    self.lang(),
                    "연장은 시스템 트레이에서 계속 실행됩니다.",
                    "Yeonjang is still running in the system tray.",
                ));
                self.apply_lifecycle_command(command, "window-hidden")
            }
            Message::SelectTab(tab) => {
                self.active_tab = tab;
                Task::none()
            }
            Message::SetLanguage(lang) => {
                self.settings.ui_language = lang;
                self.sync_tray_menu();
                Task::none()
            }
            Message::HostChanged(value) => {
                self.settings.connection.host = value;
                Task::none()
            }
            Message::PortChanged(value) => {
                self.port_input = value;
                Task::none()
            }
            Message::UsernameChanged(value) => {
                self.settings.connection.username = value;
                Task::none()
            }
            Message::PasswordChanged(value) => {
                self.settings.connection.password = value;
                Task::none()
            }
            Message::DisplayNameChanged(value) => {
                self.settings.display_name = value;
                Task::none()
            }
            Message::ToggleAutoConnect(value) => {
                self.settings.connection.auto_connect = value;
                Task::none()
            }
            Message::ToggleLaunchOnStartup(value) => {
                self.settings.connection.launch_on_system_start = value;
                Task::none()
            }
            Message::TogglePermission(field, value) => {
                match field {
                    PermissionField::SystemControl => {
                        self.settings.permissions.allow_system_control = value;
                    }
                    PermissionField::ShellExec => {
                        self.settings.permissions.allow_shell_exec = value;
                    }
                    PermissionField::ApplicationLaunch => {
                        self.settings.permissions.allow_application_launch = value;
                    }
                    PermissionField::ScreenCapture => {
                        self.settings.permissions.allow_screen_capture = value;
                    }
                    PermissionField::KeyboardControl => {
                        self.settings.permissions.allow_keyboard_control = value;
                    }
                    PermissionField::MouseControl => {
                        self.settings.permissions.allow_mouse_control = value;
                    }
                }
                Task::none()
            }
            Message::CheckConnection => {
                self.check_connection();
                Task::none()
            }
            Message::Connect => {
                self.connect_now();
                Task::none()
            }
            Message::Disconnect => {
                self.disconnect();
                Task::none()
            }
            Message::Save => {
                self.save();
                Task::none()
            }
            Message::Reload => {
                self.reload();
                Task::none()
            }
            Message::CancelChanges => {
                self.cancel_changes();
                Task::none()
            }
            Message::RestoreDefaults => {
                self.restore_defaults();
                Task::none()
            }
            Message::RegenerateExtensionId => {
                self.regenerate_extension_id();
                Task::none()
            }
            Message::CopyExtensionId => {
                iced::clipboard::write(self.settings.node_id.clone()).map(|()| Message::Copied)
            }
            Message::Copied => {
                self.set_status(t(
                    self.lang(),
                    "연장 ID를 복사했습니다.",
                    "Copied the extension ID.",
                ));
                Task::none()
            }
        }
    }

    fn subscription(&self) -> Subscription<Message> {
        Subscription::batch([
            time::every(Duration::from_millis(250)).map(|_| Message::Tick),
            window::close_requests().map(Message::WindowCloseRequested),
        ])
    }

    fn view(&self) -> Element<'_, Message> {
        let lang = self.lang();
        let (badge, detail) = self.connection_status_text();

        let header = container(
            row![
                column![
                    text("Yeonjang").size(22).color(color_text()),
                    text(t(lang, "노비 연장", "Nobie Extension"))
                        .size(12)
                        .color(color_muted()),
                    text(t(
                        lang,
                        "Nobie와 연결되는 로컬 연장",
                        "Local extension connected to Nobie",
                    ))
                    .size(11)
                    .color(color_muted()),
                ]
                .spacing(4)
                .width(Length::Fill),
                row![
                    styled_button(
                        "한글",
                        ButtonKind::Text,
                        Some(Message::SetLanguage(UiLanguage::Ko))
                    ),
                    styled_button(
                        "English",
                        ButtonKind::Text,
                        Some(Message::SetLanguage(UiLanguage::En))
                    ),
                    status_pill(badge, connection_status_kind(self.connection_state)),
                ]
                .spacing(6)
                .align_y(Alignment::Center),
            ]
            .spacing(12)
            .align_y(Alignment::Center),
        )
        .padding(18)
        .width(Length::Fill)
        .style(header_style);

        let tabs = container(
            row![
                tab_button(
                    lang,
                    self.active_tab,
                    ActiveTab::Connection,
                    "노비 연결",
                    "Connection",
                    "Broker",
                    "Broker",
                ),
                tab_button(
                    lang,
                    self.active_tab,
                    ActiveTab::ExtensionInfo,
                    "연장 정보",
                    "Extension",
                    "Device",
                    "Device",
                ),
                tab_button(
                    lang,
                    self.active_tab,
                    ActiveTab::Permissions,
                    "권한",
                    "Permissions",
                    "Access",
                    "Access",
                ),
            ]
            .spacing(10),
        )
        .padding(14)
        .width(Length::Fill)
        .style(tabs_style);

        let body = match self.active_tab {
            ActiveTab::Connection => self.connection_tab(detail),
            ActiveTab::ExtensionInfo => self.extension_tab(),
            ActiveTab::Permissions => self.permissions_tab(),
        };

        let footer = container(
            row![
                text(self.footer_text())
                    .size(13)
                    .color(color_muted())
                    .width(Length::Fill),
                styled_button(
                    t(lang, "다시 불러오기", "Reload"),
                    ButtonKind::Default,
                    Some(Message::Reload),
                ),
                styled_button(
                    t(lang, "기본값 복원", "Reset"),
                    ButtonKind::Linkish,
                    Some(Message::RestoreDefaults),
                ),
                styled_button(
                    t(lang, "취소", "Cancel"),
                    ButtonKind::Default,
                    Some(Message::CancelChanges),
                ),
                styled_button(
                    t(lang, "저장", "Save"),
                    ButtonKind::Primary,
                    Some(Message::Save),
                ),
            ]
            .spacing(8)
            .align_y(Alignment::Center),
        )
        .padding(16)
        .width(Length::Fill)
        .style(footer_style);

        container(
            column![
                header,
                tabs,
                container(
                    scrollable(
                        container(body)
                            .width(Length::Fill)
                            .padding(Padding::ZERO.right(18.0)),
                    )
                    .height(Length::Fill)
                    .width(Length::Fill),
                )
                .padding(18)
                .height(Length::Fill)
                .width(Length::Fill),
                footer,
            ]
            .height(Length::Fill),
        )
        .width(Length::Fill)
        .height(Length::Fill)
        .style(window_style)
        .into()
    }

    fn connection_tab(&self, connection_detail: String) -> Element<'_, Message> {
        let lang = self.lang();
        let disconnect_button = styled_button(
            t(lang, "연결 끊기", "Disconnect"),
            ButtonKind::Danger,
            (self.connection_state == ConnectionState::Connected).then_some(Message::Disconnect),
        );

        column![
            section_title(
                t(lang, "노비 연결", "Connection"),
                t(
                    lang,
                    "브로커 주소와 인증 정보만 입력합니다.",
                    "Enter only the broker address and credentials.",
                )
            ),
            info_block(
                t(lang, "현재 상태", "Current Status"),
                vec![
                    (t(lang, "상태", "Status").to_string(), connection_detail),
                    (
                        t(lang, "마지막 오류", "Last Error").to_string(),
                        self.display_last_error()
                    ),
                ],
            ),
            card(
                t(lang, "브로커 설정", "Broker Settings"),
                column![
                    row![
                        form_field(
                            t(lang, "연결 주소 (Host) *", "Host *"),
                            text_input("127.0.0.1", &self.settings.connection.host)
                                .on_input(Message::HostChanged)
                                .padding(12)
                                .style(input_style),
                        ),
                        form_field(
                            t(lang, "포트 (Port) *", "Port *"),
                            text_input("1883", &self.port_input)
                                .on_input(Message::PortChanged)
                                .padding(12)
                                .style(input_style),
                        ),
                    ]
                    .spacing(12),
                    row![
                        form_field(
                            t(lang, "아이디 (ID)", "ID"),
                            text_input("", &self.settings.connection.username)
                                .on_input(Message::UsernameChanged)
                                .padding(12)
                                .style(input_style),
                        ),
                        form_field(
                            t(lang, "비밀번호 (Password)", "Password"),
                            text_input("", &self.settings.connection.password)
                                .secure(true)
                                .on_input(Message::PasswordChanged)
                                .padding(12)
                                .style(input_style),
                        ),
                    ]
                    .spacing(12),
                    toggle_row(
                        t(lang, "자동 접속", "Auto Connect"),
                        t(
                            lang,
                            "앱 시작 시 브로커 연결을 자동으로 시도합니다.",
                            "Try to connect to the broker when the app starts.",
                        ),
                        self.settings.connection.auto_connect,
                        Message::ToggleAutoConnect,
                    ),
                    toggle_row(
                        t(lang, "시스템 시작 시 실행", "Launch on Startup"),
                        t(
                            lang,
                            "운영체제 로그인 후 Yeonjang을 자동으로 실행합니다.",
                            "Launch Yeonjang automatically after OS login.",
                        ),
                        self.settings.connection.launch_on_system_start,
                        Message::ToggleLaunchOnStartup,
                    ),
                    row![
                        styled_button(
                            t(lang, "연결 확인", "Check"),
                            ButtonKind::Default,
                            Some(Message::CheckConnection),
                        ),
                        styled_button(
                            self.reconnect_button_label(),
                            ButtonKind::Primary,
                            Some(Message::Connect),
                        ),
                        disconnect_button,
                    ]
                    .spacing(8),
                ]
                .spacing(12)
                .into(),
            ),
            alert_box(
                t(lang, "최근 상태", "Recent Status"),
                &self.status_message,
                connection_status_kind(self.connection_state),
            ),
        ]
        .spacing(12)
        .width(Length::Fill)
        .into()
    }

    fn extension_tab(&self) -> Element<'_, Message> {
        let lang = self.lang();
        let platform = format!(
            "{} {}",
            current_platform_name(),
            current_platform_version_hint()
        )
        .trim()
        .to_string();

        column![
            section_title(
                t(lang, "연장 정보", "Extension"),
                t(
                    lang,
                    "자동으로 감지된 정보입니다.",
                    "Detected automatically."
                )
            ),
            info_block(
                t(lang, "요약", "Summary"),
                vec![
                    (
                        t(lang, "연장 ID", "Extension ID").to_string(),
                        self.settings.node_id.clone()
                    ),
                    (
                        t(lang, "표시 이름", "Display Name").to_string(),
                        self.settings.display_name.clone(),
                    ),
                    (t(lang, "플랫폼", "Platform").to_string(), platform),
                    (
                        t(lang, "호스트 이름", "Host Name").to_string(),
                        detected_host_name(),
                    ),
                    (
                        t(lang, "앱 버전", "App Version").to_string(),
                        env!("CARGO_PKG_VERSION").to_string(),
                    ),
                ],
            ),
            form_field(
                t(lang, "표시 이름", "Display Name"),
                text_input("Yeonjang", &self.settings.display_name)
                    .on_input(Message::DisplayNameChanged)
                    .padding(12)
                    .style(input_style),
            ),
            row![
                styled_button(
                    t(lang, "연장 ID 복사", "Copy Extension ID"),
                    ButtonKind::Default,
                    Some(Message::CopyExtensionId),
                ),
                styled_button(
                    t(lang, "연장 ID 다시 생성", "Regenerate ID"),
                    ButtonKind::Linkish,
                    Some(Message::RegenerateExtensionId),
                ),
            ]
            .spacing(8),
            alert_box(
                t(lang, "최근 상태", "Recent Status"),
                &self.status_message,
                StatusKind::Warn,
            ),
        ]
        .spacing(12)
        .width(Length::Fill)
        .into()
    }

    fn permissions_tab(&self) -> Element<'_, Message> {
        let lang = self.lang();
        let (enabled, disabled, os_required) = self.permission_counts();

        column![
            section_title(
                t(lang, "권한", "Permissions"),
                t(
                    lang,
                    "필요한 항목만 켜서 사용합니다.",
                    "Enable only what you need."
                )
            ),
            info_block(
                t(lang, "권한 상태", "Permission Status"),
                vec![
                    (
                        t(lang, "허용됨", "Enabled").to_string(),
                        enabled.to_string()
                    ),
                    (t(lang, "꺼짐", "Off").to_string(), disabled.to_string()),
                    (
                        t(lang, "OS 승인 필요", "OS Approval").to_string(),
                        os_required.to_string(),
                    ),
                ],
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_system_control,
                PermissionField::SystemControl,
                "시스템 제어",
                "System Control",
                "상태 확인과 기본 제어",
                "Status and basic control",
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_shell_exec,
                PermissionField::ShellExec,
                "명령 실행",
                "Command Execution",
                "터미널 명령 실행",
                "Run terminal commands",
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_application_launch,
                PermissionField::ApplicationLaunch,
                "앱 실행",
                "Application Launch",
                "앱 열기와 전달 인수 실행",
                "Open applications and pass launch arguments",
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_screen_capture,
                PermissionField::ScreenCapture,
                "화면 캡처",
                "Screen Capture",
                "화면을 캡처해 전달",
                "Capture and send the screen",
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_keyboard_control,
                PermissionField::KeyboardControl,
                "키보드 제어",
                "Keyboard Control",
                "입력과 단축키 실행",
                "Typing and shortcuts",
            ),
            permission_checkbox(
                lang,
                self.settings.permissions.allow_mouse_control,
                PermissionField::MouseControl,
                "마우스 제어",
                "Mouse Control",
                "이동과 클릭",
                "Move and click",
            ),
            alert_box(
                t(lang, "운영체제 권한", "OS Permissions"),
                t(
                    lang,
                    "일부 권한은 운영체제 승인 후에 동작합니다.",
                    "Some permissions work only after OS approval.",
                ),
                StatusKind::Warn,
            ),
            alert_box(
                t(lang, "최근 상태", "Recent Status"),
                &self.status_message,
                StatusKind::Disabled,
            ),
        ]
        .spacing(12)
        .width(Length::Fill)
        .into()
    }

    fn is_dirty(&self) -> bool {
        self.settings != self.saved_settings
    }

    fn set_status(&mut self, message: impl Into<String>) {
        self.status_message = message.into();
    }

    fn save(&mut self) {
        match parse_port_input(&self.port_input, self.lang()) {
            Ok(port) => {
                self.settings.connection.port = port;
            }
            Err(message) => {
                self.set_status(message);
                return;
            }
        }

        match save_settings(&self.settings) {
            Ok(_) => {
                self.saved_settings = self.settings.clone();
                self.port_input = self.settings.connection.port.to_string();
                match sync_launch_on_startup(&self.settings) {
                    Ok(result) => {
                        self.set_status(if result.enabled {
                            format!(
                                "{}: {}",
                                t(
                                    self.lang(),
                                    "현재 설정을 저장했고 자동 시작을 동기화했습니다",
                                    "Settings saved and launch on startup was synced",
                                ),
                                result.entry_path.display()
                            )
                        } else {
                            format!(
                                "{}: {}",
                                t(
                                    self.lang(),
                                    "현재 설정을 저장했고 자동 시작 항목을 정리했습니다",
                                    "Settings saved and launch on startup entry was removed",
                                ),
                                result.entry_path.display()
                            )
                        });
                    }
                    Err(error) => {
                        self.set_status(format!(
                            "{}: {error}",
                            t(
                                self.lang(),
                                "설정은 저장했지만 자동 시작 동기화는 실패했습니다",
                                "Settings were saved, but launch on startup sync failed"
                            )
                        ));
                    }
                }
                self.publish_runtime_presence("settings-saved");
            }
            Err(error) => {
                self.set_status(format!(
                    "{}: {error}",
                    t(self.lang(), "설정 저장 실패", "Failed to save settings")
                ));
            }
        }
    }

    fn reload(&mut self) {
        match load_settings() {
            Ok(settings) => {
                self.saved_settings = settings.clone();
                self.port_input = settings.connection.port.to_string();
                self.settings = settings;
                self.set_status(t(
                    self.lang(),
                    "디스크의 설정을 다시 불러왔습니다.",
                    "Reloaded settings from disk.",
                ));
            }
            Err(error) => {
                self.set_status(format!(
                    "{}: {error}",
                    t(
                        self.lang(),
                        "설정 다시 불러오기 실패",
                        "Failed to reload settings"
                    )
                ));
            }
        }
    }

    fn cancel_changes(&mut self) {
        self.settings = self.saved_settings.clone();
        self.port_input = self.settings.connection.port.to_string();
        self.set_status(t(
            self.lang(),
            "저장된 상태로 되돌렸습니다.",
            "Reverted to the saved state.",
        ));
    }

    fn restore_defaults(&mut self) {
        self.settings = YeonjangSettings::default();
        self.port_input = self.settings.connection.port.to_string();
        self.set_status(t(
            self.lang(),
            "기본값으로 되돌렸습니다. 저장 후 적용됩니다.",
            "Restored defaults. Save to apply them.",
        ));
    }

    fn check_connection(&mut self) {
        match self.validate_connection_inputs(false) {
            Ok(()) => {}
            Err(message) => {
                self.connection_state = ConnectionState::Disconnected;
                self.last_error = message.clone();
                self.set_status(message);
                return;
            }
        }

        match probe_connection(&self.settings) {
            Ok(()) => {
                self.connection_state = ConnectionState::Disconnected;
                self.last_error = t(self.lang(), "없음", "None").to_string();
                self.set_status(t(
                    self.lang(),
                    "브로커 주소에 접근할 수 있습니다.",
                    "The broker address is reachable.",
                ));
            }
            Err(error) => {
                self.connection_state = ConnectionState::Disconnected;
                self.last_error = error.to_string();
                self.set_status(format!(
                    "{}: {error}",
                    t(self.lang(), "연결 확인 실패", "Connection check failed")
                ));
            }
        }
    }

    fn connect_now(&mut self) {
        self.connection_attempted = true;
        match self.validate_connection_inputs(true) {
            Ok(()) => {}
            Err(message) => {
                self.connection_state = ConnectionState::AuthFailed;
                self.last_error = message.clone();
                self.set_status(message);
                return;
            }
        }

        self.stop_runtime();
        match start_runtime(self.settings.clone(), Arc::clone(&self.lifecycle_state)) {
            Ok((runtime, events)) => {
                self.mqtt_runtime = Some(runtime);
                self.mqtt_runtime_events = Some(events);
                self.connection_state = ConnectionState::Disconnected;
                self.set_status(t(
                    self.lang(),
                    "Nobie 브로커에 연결하는 중입니다.",
                    "Connecting to the Nobie broker.",
                ));
            }
            Err(error) => {
                self.connection_state = ConnectionState::Disconnected;
                self.last_error = error.to_string();
                self.set_status(format!(
                    "{}: {error}",
                    t(
                        self.lang(),
                        "연결 시작 실패",
                        "Failed to start the connection"
                    )
                ));
            }
        }
    }

    fn disconnect(&mut self) {
        self.stop_runtime();
        self.connection_state = ConnectionState::Disconnected;
        self.last_error = t(self.lang(), "연결이 끊어졌습니다.", "Disconnected.").to_string();
        self.set_status(t(
            self.lang(),
            "브로커 연결을 종료했습니다.",
            "Broker connection closed.",
        ));
    }

    fn stop_runtime(&mut self) {
        self.mqtt_runtime_events = None;
        if let Some(runtime) = self.mqtt_runtime.take() {
            let _ = runtime.stop();
        }
    }

    fn process_runtime_events(&mut self) {
        let mut pending = Vec::new();
        if let Some(receiver) = &self.mqtt_runtime_events {
            while let Ok(event) = receiver.try_recv() {
                pending.push(event);
            }
        }

        for event in pending {
            match event {
                RuntimeEvent::Connected => {
                    self.connection_attempted = true;
                    self.connection_state = ConnectionState::Connected;
                    self.last_error = t(self.lang(), "없음", "None").to_string();
                    self.set_status(t(
                        self.lang(),
                        "Nobie 브로커에 연결되었습니다.",
                        "Connected to the Nobie broker.",
                    ));
                }
                RuntimeEvent::Reconnecting(message) => {
                    self.connection_attempted = true;
                    self.connection_state = ConnectionState::Disconnected;
                    self.last_error = message.clone();
                    self.set_status(format!(
                        "{}: {message}",
                        t(
                            self.lang(),
                            "브로커 연결이 끊겨 다시 연결하는 중입니다",
                            "Broker connection lost. Reconnecting"
                        )
                    ));
                }
                RuntimeEvent::Disconnected(message) => {
                    self.stop_runtime();
                    self.connection_state = ConnectionState::Disconnected;
                    self.last_error = message.clone();
                    self.set_status(format!(
                        "{}: {message}",
                        t(
                            self.lang(),
                            "브로커 연결이 종료되었습니다",
                            "Broker connection closed"
                        )
                    ));
                }
                RuntimeEvent::AuthFailed(message) => {
                    self.stop_runtime();
                    self.connection_state = ConnectionState::AuthFailed;
                    self.last_error = message.clone();
                    self.set_status(format!(
                        "{}: {message}",
                        t(self.lang(), "인증 실패", "Authentication failed")
                    ));
                }
                RuntimeEvent::ResponsePublishFailed { method, message } => {
                    self.last_error = message.clone();
                    self.set_status(format!(
                        "{}: {method} ({message})",
                        t(self.lang(), "응답 전송 실패", "Response publish failed")
                    ));
                }
                RuntimeEvent::RequestHandled { method, ok } => {
                    self.set_status(if ok {
                        format!(
                            "{}: {method}",
                            t(self.lang(), "명령 처리 완료", "Command handled")
                        )
                    } else {
                        format!(
                            "{}: {method}",
                            t(self.lang(), "명령 처리 실패", "Command failed")
                        )
                    });
                }
            }
        }
    }

    fn validate_connection_inputs(
        &mut self,
        require_auth: bool,
    ) -> std::result::Result<(), String> {
        match parse_port_input(&self.port_input, self.lang()) {
            Ok(port) => {
                self.settings.connection.port = port;
            }
            Err(message) => return Err(message),
        }

        if self.settings.connection.host.trim().is_empty() {
            return Err(t(
                self.lang(),
                "연결 주소를 입력해야 합니다.",
                "Connection host is required.",
            )
            .to_string());
        }

        if require_auth {
            if self.settings.connection.username.trim().is_empty()
                || self.settings.connection.password.trim().is_empty()
            {
                return Err(t(
                    self.lang(),
                    "아이디와 비밀번호를 모두 입력해야 합니다.",
                    "Both username and password are required.",
                )
                .to_string());
            }
        }

        Ok(())
    }

    fn regenerate_extension_id(&mut self) {
        let host = detected_host_name();
        let slug = sanitize_token(&host);
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs() % 100_000)
            .unwrap_or(0);
        self.settings.node_id = format!("yeonjang-{slug}-{suffix}");
        self.settings.reset_topics_from_node_id();
        self.set_status(t(
            self.lang(),
            "연장 ID를 다시 만들었습니다.",
            "Regenerated the extension ID.",
        ));
    }

    fn connection_status_text(&self) -> (&'static str, String) {
        match self.connection_state {
            ConnectionState::Disconnected => (
                t(self.lang(), "연결 안 됨", "Offline"),
                t(self.lang(), "연결되지 않음", "Disconnected").to_string(),
            ),
            ConnectionState::Connected => (
                t(self.lang(), "연결됨", "Connected"),
                t(self.lang(), "연결됨", "Connected").to_string(),
            ),
            ConnectionState::AuthFailed => (
                t(self.lang(), "인증 실패", "Auth Failed"),
                t(self.lang(), "인증 실패", "Auth Failed").to_string(),
            ),
        }
    }

    fn footer_text(&self) -> String {
        if self.is_dirty() {
            return t(
                self.lang(),
                "저장 전 변경 사항이 있습니다.",
                "There are unsaved changes.",
            )
            .to_string();
        }

        match self.active_tab {
            ActiveTab::Connection => match self.connection_state {
                ConnectionState::Connected => t(
                    self.lang(),
                    "Nobie 브로커에 연결되어 있습니다.",
                    "Connected to the Nobie broker.",
                )
                .to_string(),
                ConnectionState::AuthFailed => t(
                    self.lang(),
                    "인증 정보를 다시 확인해 주세요.",
                    "Check the authentication details.",
                )
                .to_string(),
                ConnectionState::Disconnected => t(
                    self.lang(),
                    "브로커 연결을 아직 확인하지 않았습니다.",
                    "Broker connection has not been checked yet.",
                )
                .to_string(),
            },
            ActiveTab::ExtensionInfo => t(
                self.lang(),
                "연장 정보가 준비되었습니다.",
                "Extension information is ready.",
            )
            .to_string(),
            ActiveTab::Permissions => t(
                self.lang(),
                "권한 변경 후 운영체제 확인이 필요할 수 있습니다.",
                "OS approval may be required after changing permissions.",
            )
            .to_string(),
        }
    }

    fn display_last_error(&self) -> String {
        if self.connection_state == ConnectionState::Connected {
            t(self.lang(), "없음", "None").to_string()
        } else {
            self.last_error.clone()
        }
    }

    fn reconnect_button_label(&self) -> &'static str {
        if self.connection_attempted && self.connection_state != ConnectionState::Connected {
            t(self.lang(), "다시 연결", "Reconnect")
        } else {
            t(self.lang(), "지금 연결", "Connect")
        }
    }

    fn permission_counts(&self) -> (usize, usize, usize) {
        let items = [
            self.settings.permissions.allow_system_control,
            self.settings.permissions.allow_shell_exec,
            self.settings.permissions.allow_application_launch,
            self.settings.permissions.allow_screen_capture,
            self.settings.permissions.allow_keyboard_control,
            self.settings.permissions.allow_mouse_control,
        ];
        let enabled = items.into_iter().filter(|value| *value).count();
        let disabled = items.len() - enabled;
        let os_required = usize::from(self.settings.permissions.allow_screen_capture)
            + usize::from(self.settings.permissions.allow_keyboard_control);
        (enabled, disabled, os_required)
    }

    fn drain_tray_actions(&self) -> Vec<TrayAction> {
        self.tray_controller
            .as_ref()
            .map(SystemTrayController::drain_actions)
            .unwrap_or_default()
    }

    fn is_window_visible(&self) -> bool {
        self.lifecycle.state().window_mode == WindowModeState::Visible
    }

    fn sync_lifecycle_registration(&self) {
        write_shared_lifecycle_state(&self.lifecycle_state, self.lifecycle.state());
    }

    fn sync_tray_menu(&self) {
        if let Some(controller) = &self.tray_controller {
            controller.sync_state(
                self.lang(),
                self.connection_state,
                self.permission_counts(),
                self.is_window_visible(),
            );
        }
    }

    fn publish_runtime_presence(&mut self, message: &str) {
        if let Some(runtime) = &self.mqtt_runtime {
            if let Err(error) = runtime.refresh_presence(message) {
                self.last_error = error.to_string();
            }
        }
    }

    fn apply_lifecycle_command(
        &mut self,
        command: LifecycleCommand,
        runtime_message: &str,
    ) -> Task<Message> {
        self.sync_lifecycle_registration();
        self.sync_tray_menu();
        self.publish_runtime_presence(runtime_message);
        match command {
            LifecycleCommand::None => Task::none(),
            LifecycleCommand::ShowWindow => {
                self.quit_in_progress = false;
                window_command(WindowCommand::Show)
            }
            LifecycleCommand::HideWindow => {
                self.quit_in_progress = false;
                window_command(WindowCommand::Hide)
            }
            LifecycleCommand::QuitApp => {
                self.quit_in_progress = true;
                window_command(WindowCommand::Quit)
            }
        }
    }
}

impl Drop for YeonjangGuiApp {
    fn drop(&mut self) {
        self.stop_runtime();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WindowCommand {
    Show,
    Hide,
    Quit,
}

fn window_command(command: WindowCommand) -> Task<Message> {
    window::latest().and_then(move |id| match command {
        WindowCommand::Show => Task::batch([
            window::set_mode(id, window::Mode::Windowed),
            window::minimize(id, false),
            window::gain_focus(id),
        ]),
        WindowCommand::Hide => window::set_mode(id, window::Mode::Hidden),
        WindowCommand::Quit => iced::exit(),
    })
}

fn connection_state_label(lang: UiLanguage, state: ConnectionState) -> &'static str {
    match state {
        ConnectionState::Disconnected => t(lang, "연결 안 됨", "Offline"),
        ConnectionState::Connected => t(lang, "연결됨", "Connected"),
        ConnectionState::AuthFailed => t(lang, "인증 실패", "Auth Failed"),
    }
}

fn tab_button(
    lang: UiLanguage,
    active: ActiveTab,
    tab: ActiveTab,
    ko: &'static str,
    en: &'static str,
    ko_meta: &'static str,
    en_meta: &'static str,
) -> iced::widget::Button<'static, Message> {
    let is_active = active == tab;

    button(
        column![
            text(t(lang, ko, en)).size(14).color(color_text()),
            text(t(lang, ko_meta, en_meta))
                .size(11)
                .color(color_muted()),
        ]
        .spacing(3),
    )
    .padding(10)
    .style(move |_theme, status| button_style(ButtonKind::Tab { active: is_active }, status))
    .on_press(Message::SelectTab(tab))
}

fn section_title<'a>(title: &'a str, description: &'a str) -> Element<'a, Message> {
    column![
        text(title).size(22).color(color_text()),
        text(description).size(13).color(color_muted()),
    ]
    .spacing(6)
    .into()
}

fn card<'a>(title: &'a str, content: Element<'a, Message>) -> Element<'a, Message> {
    container(
        column![text(title).size(14).color(color_text()), content]
            .spacing(10)
            .width(Length::Fill),
    )
    .padding(16)
    .width(Length::Fill)
    .style(card_style)
    .into()
}

fn alert_box<'a>(title: &'a str, message: &'a str, kind: StatusKind) -> Element<'a, Message> {
    let (_background, foreground, _border) = status_colors(kind);

    container(
        row![
            container(text("!").size(13).color(foreground))
                .width(24)
                .height(24)
                .center_x(Length::Fill)
                .center_y(Length::Fill)
                .style(move |_theme| alert_icon_style(kind)),
            column![
                text(title).size(13).color(foreground).width(Length::Fill),
                text(message).size(13).color(foreground).width(Length::Fill),
            ]
            .spacing(3)
            .align_x(Alignment::Start)
            .width(Length::Fill),
        ]
        .spacing(10)
        .align_y(Alignment::Center)
        .width(Length::Fill),
    )
    .width(Length::Fill)
    .padding(12)
    .style(move |_theme| alert_style(kind))
    .into()
}

fn toggle_row(
    title: &'static str,
    description: &'static str,
    enabled: bool,
    on_toggle: fn(bool) -> Message,
) -> Element<'static, Message> {
    container(
        row![
            column![
                text(title).size(14).color(color_text()),
                text(description).size(12).color(color_muted()),
            ]
            .spacing(4)
            .width(Length::Fill),
            checkbox(enabled)
                .label("")
                .on_toggle(on_toggle)
                .style(checkbox_style),
        ]
        .spacing(12)
        .align_y(Alignment::Center),
    )
    .padding(12)
    .width(Length::Fill)
    .style(mini_card_style)
    .into()
}

fn status_pill(label: &'static str, kind: StatusKind) -> Element<'static, Message> {
    let (_background, foreground, _border) = status_colors(kind);

    container(text(label).size(12).color(foreground))
        .height(28)
        .padding(8)
        .style(move |_theme| pill_style(kind))
        .into()
}

fn form_field<'a>(label: &'a str, input: impl Into<Element<'a, Message>>) -> Element<'a, Message> {
    column![text(label).size(13).color(color_text()), input.into()]
        .spacing(7)
        .width(Length::Fill)
        .into()
}

fn info_block<'a>(title: &'a str, rows: Vec<(String, String)>) -> Element<'a, Message> {
    let mut content = column![text(title).size(14).color(color_text())].spacing(8);
    for (key, value) in rows {
        content = content.push(
            row![
                text(key)
                    .size(13)
                    .color(color_muted())
                    .width(Length::FillPortion(1)),
                text(value)
                    .size(13)
                    .color(color_text())
                    .width(Length::FillPortion(3)),
            ]
            .spacing(8),
        );
    }

    container(content)
        .padding(16)
        .width(Length::Fill)
        .style(card_style)
        .into()
}

fn permission_checkbox(
    lang: UiLanguage,
    enabled: bool,
    field: PermissionField,
    ko_title: &'static str,
    en_title: &'static str,
    ko_description: &'static str,
    en_description: &'static str,
) -> Element<'static, Message> {
    container(
        row![
            column![
                text(t(lang, ko_title, en_title))
                    .size(14)
                    .color(color_text()),
                text(t(lang, ko_description, en_description))
                    .size(12)
                    .color(color_muted()),
            ]
            .spacing(4)
            .width(Length::Fill),
            checkbox(enabled)
                .label("")
                .on_toggle(move |value| Message::TogglePermission(field, value))
                .style(checkbox_style),
        ]
        .spacing(12)
        .align_y(Alignment::Center),
    )
    .padding(12)
    .width(Length::Fill)
    .style(mini_card_style)
    .into()
}

#[derive(Debug, Clone, Copy)]
enum StatusKind {
    Success,
    Warn,
    Danger,
    Disabled,
}

#[derive(Debug, Clone, Copy)]
enum ButtonKind {
    Default,
    Primary,
    Danger,
    Linkish,
    Text,
    Tab { active: bool },
}

fn styled_button<'a>(
    label: &'a str,
    kind: ButtonKind,
    on_press: Option<Message>,
) -> iced::widget::Button<'a, Message> {
    let button = button(text(label).size(13))
        .padding(10)
        .height(38)
        .style(move |_theme, status| button_style(kind, status));

    if let Some(message) = on_press {
        button.on_press(message)
    } else {
        button
    }
}

fn connection_status_kind(state: ConnectionState) -> StatusKind {
    match state {
        ConnectionState::Connected => StatusKind::Success,
        ConnectionState::Disconnected => StatusKind::Warn,
        ConnectionState::AuthFailed => StatusKind::Danger,
    }
}

fn color_panel() -> Color {
    Color::from_rgb8(0xfb, 0xf8, 0xf4)
}

fn color_card() -> Color {
    Color::WHITE
}

fn color_line() -> Color {
    Color::from_rgb8(0xe5, 0xdb, 0xcf)
}

fn color_text() -> Color {
    Color::from_rgb8(0x2f, 0x2a, 0x26)
}

fn color_muted() -> Color {
    Color::from_rgb8(0x7d, 0x73, 0x6b)
}

fn color_brand() -> Color {
    Color::from_rgb8(0xb8, 0x8c, 0x5a)
}

fn color_brand_deep() -> Color {
    Color::from_rgb8(0x6d, 0x4c, 0x2d)
}

fn color_brand_soft() -> Color {
    Color::from_rgb8(0xf2, 0xe5, 0xd5)
}

fn color_disabled_bg() -> Color {
    Color::from_rgb8(0xf0, 0xec, 0xe7)
}

fn color_disabled_text() -> Color {
    Color::from_rgb8(0x8b, 0x83, 0x7c)
}

fn color_danger_text() -> Color {
    Color::from_rgb8(0xb1, 0x3a, 0x3a)
}

fn status_colors(kind: StatusKind) -> (Color, Color, Color) {
    match kind {
        StatusKind::Success => (
            Color::from_rgb8(0xe9, 0xf6, 0xee),
            Color::from_rgb8(0x1f, 0x7a, 0x44),
            Color::from_rgb8(0xcc, 0xeb, 0xd6),
        ),
        StatusKind::Warn => (
            Color::from_rgb8(0xff, 0xf4, 0xdd),
            Color::from_rgb8(0x9a, 0x68, 0x04),
            Color::from_rgb8(0xef, 0xd9, 0xaa),
        ),
        StatusKind::Danger => (
            Color::from_rgb8(0xfd, 0xea, 0xea),
            color_danger_text(),
            Color::from_rgb8(0xef, 0xcc, 0xcc),
        ),
        StatusKind::Disabled => (
            color_disabled_bg(),
            color_disabled_text(),
            Color::from_rgb8(0xe3, 0xd9, 0xd0),
        ),
    }
}

fn make_border(color: Color, width: f32, radius: f32) -> Border {
    Border {
        color,
        width,
        radius: radius.into(),
    }
}

fn panel_shadow() -> Shadow {
    Shadow {
        color: Color::from_rgba8(0x3d, 0x2a, 0x18, 0.12),
        offset: Vector { x: 0.0, y: 20.0 },
        blur_radius: 44.0,
    }
}

fn card_shadow() -> Shadow {
    Shadow {
        color: Color::from_rgba8(0x3d, 0x2a, 0x18, 0.05),
        offset: Vector { x: 0.0, y: 6.0 },
        blur_radius: 18.0,
    }
}

fn hover_shadow() -> Shadow {
    Shadow {
        color: Color::from_rgba8(0x3d, 0x2a, 0x18, 0.08),
        offset: Vector { x: 0.0, y: 6.0 },
        blur_radius: 14.0,
    }
}

fn window_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_text()),
        background: Some(Background::Color(color_panel())),
        border: make_border(color_line(), 1.0, 22.0),
        shadow: panel_shadow(),
        snap: false,
    }
}

fn header_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_text()),
        background: Some(Background::Color(Color::from_rgba8(0xff, 0xff, 0xff, 0.35))),
        border: make_border(color_line(), 1.0, 0.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn tabs_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_text()),
        background: Some(Background::Color(Color::from_rgb8(0xf7, 0xf1, 0xe8))),
        border: make_border(color_line(), 1.0, 0.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn footer_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_muted()),
        background: Some(Background::Color(Color::from_rgb8(0xff, 0xfb, 0xf6))),
        border: make_border(color_line(), 1.0, 0.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn card_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_text()),
        background: Some(Background::Color(color_card())),
        border: make_border(color_line(), 1.0, 14.0),
        shadow: card_shadow(),
        snap: false,
    }
}

fn mini_card_style(_theme: &iced::Theme) -> container::Style {
    container::Style {
        text_color: Some(color_text()),
        background: Some(Background::Color(Color::from_rgb8(0xff, 0xfd, 0xfa))),
        border: make_border(Color::from_rgb8(0xe7, 0xdd, 0xd2), 1.0, 12.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn alert_style(kind: StatusKind) -> container::Style {
    let (background, foreground, border) = status_colors(kind);

    container::Style {
        text_color: Some(foreground),
        background: Some(Background::Color(background)),
        border: make_border(border, 1.0, 13.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn alert_icon_style(kind: StatusKind) -> container::Style {
    let (_background, foreground, _border) = status_colors(kind);

    container::Style {
        text_color: Some(foreground),
        background: Some(Background::Color(Color::from_rgba8(0xff, 0xff, 0xff, 0.7))),
        border: make_border(Color::TRANSPARENT, 0.0, 999.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn pill_style(kind: StatusKind) -> container::Style {
    let (background, foreground, border) = status_colors(kind);

    container::Style {
        text_color: Some(foreground),
        background: Some(Background::Color(background)),
        border: make_border(border, 1.0, 999.0),
        shadow: Shadow::default(),
        snap: false,
    }
}

fn button_style(kind: ButtonKind, status: button::Status) -> button::Style {
    let hovered = matches!(status, button::Status::Hovered | button::Status::Pressed);
    let disabled = matches!(status, button::Status::Disabled);

    let (background, text_color, border_color, radius) = match kind {
        ButtonKind::Default => (
            if hovered {
                Color::from_rgb8(0xff, 0xfb, 0xf7)
            } else {
                color_card()
            },
            color_text(),
            Color::from_rgb8(0xdd, 0xcf, 0xbf),
            11.0,
        ),
        ButtonKind::Primary => (
            if hovered {
                Color::from_rgb8(0xa8, 0x7c, 0x4e)
            } else {
                color_brand()
            },
            Color::WHITE,
            color_brand(),
            11.0,
        ),
        ButtonKind::Danger => (
            Color::from_rgb8(0xff, 0xf7, 0xf7),
            color_danger_text(),
            Color::from_rgb8(0xed, 0xc8, 0xc8),
            11.0,
        ),
        ButtonKind::Linkish => (
            if hovered {
                Color::from_rgb8(0xf4, 0xea, 0xdf)
            } else {
                Color::from_rgb8(0xf8, 0xf2, 0xeb)
            },
            color_brand_deep(),
            Color::from_rgb8(0xe7, 0xd8, 0xc7),
            11.0,
        ),
        ButtonKind::Text => (
            if hovered {
                Color::from_rgb8(0xf4, 0xea, 0xdf)
            } else {
                Color::TRANSPARENT
            },
            color_brand_deep(),
            Color::TRANSPARENT,
            10.0,
        ),
        ButtonKind::Tab { active } => (
            if active {
                color_brand_soft()
            } else if hovered {
                Color::from_rgb8(0xf2, 0xe8, 0xdc)
            } else {
                Color::TRANSPARENT
            },
            color_text(),
            if active {
                Color::from_rgb8(0xe6, 0xcf, 0xb2)
            } else {
                Color::TRANSPARENT
            },
            12.0,
        ),
    };

    let (background, text_color, border_color) = if disabled {
        (
            color_disabled_bg(),
            color_disabled_text(),
            Color::from_rgb8(0xe3, 0xd9, 0xd0),
        )
    } else {
        (background, text_color, border_color)
    };

    button::Style {
        background: Some(Background::Color(background)),
        text_color,
        border: make_border(border_color, 1.0, radius),
        shadow: if hovered && !disabled {
            hover_shadow()
        } else {
            Shadow::default()
        },
        snap: false,
    }
}

fn input_style(_theme: &iced::Theme, status: text_input::Status) -> text_input::Style {
    let active = matches!(
        status,
        text_input::Status::Hovered | text_input::Status::Focused { .. }
    );

    text_input::Style {
        background: Background::Color(color_card()),
        border: make_border(
            if active {
                color_brand()
            } else {
                Color::from_rgb8(0xdc, 0xcf, 0xc0)
            },
            1.0,
            12.0,
        ),
        icon: color_muted(),
        placeholder: color_muted(),
        value: color_text(),
        selection: color_brand_soft(),
    }
}

fn checkbox_style(_theme: &iced::Theme, status: checkbox::Status) -> checkbox::Style {
    let is_checked = match status {
        checkbox::Status::Active { is_checked }
        | checkbox::Status::Hovered { is_checked }
        | checkbox::Status::Disabled { is_checked } => is_checked,
    };
    let is_hovered = matches!(status, checkbox::Status::Hovered { .. });

    checkbox::Style {
        background: Background::Color(if is_checked {
            color_brand()
        } else if is_hovered {
            color_brand_soft()
        } else {
            Color::from_rgb8(0xdc, 0xd2, 0xc8)
        }),
        icon_color: Color::WHITE,
        border: make_border(
            if is_checked {
                color_brand()
            } else {
                color_line()
            },
            1.0,
            8.0,
        ),
        text_color: Some(color_text()),
    }
}

fn parse_port_input(input: &str, lang: UiLanguage) -> std::result::Result<u16, String> {
    input.trim().parse::<u16>().map_err(|_| {
        t(
            lang,
            "포트는 1부터 65535 사이의 숫자여야 합니다.",
            "Port must be a number between 1 and 65535.",
        )
        .to_string()
    })
}

fn current_platform_name() -> &'static str {
    if cfg!(target_os = "macos") {
        "macOS"
    } else if cfg!(target_os = "windows") {
        "Windows"
    } else if cfg!(target_os = "linux") {
        "Linux"
    } else {
        "Unknown"
    }
}

fn current_platform_version_hint() -> &'static str {
    if cfg!(target_os = "macos") { "15" } else { "" }
}

fn detected_host_name() -> String {
    env::var("HOSTNAME")
        .or_else(|_| env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "local-host".to_string())
}

fn sanitize_token(value: &str) -> String {
    let mut result = String::new();
    for ch in value.chars() {
        if ch.is_ascii_alphanumeric() {
            result.push(ch.to_ascii_lowercase());
        } else if !result.ends_with('-') {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-');
    if trimmed.is_empty() {
        "extension".to_string()
    } else {
        trimmed.to_string()
    }
}

fn build_tray_icon() -> Result<TrayIconImage> {
    let (rgba, width, height) = crate::icon::build_icon_rgba()?;
    TrayIconImage::from_rgba(rgba, width, height).map_err(|error| anyhow!(error.to_string()))
}

fn build_window_icon() -> Result<window::Icon> {
    let (rgba, width, height) = crate::icon::build_icon_rgba()?;
    window::icon::from_rgba(rgba, width, height).map_err(|error| anyhow!(error.to_string()))
}

fn load_ui_font() -> Option<(String, Vec<u8>)> {
    let candidates = if cfg!(target_os = "macos") {
        vec![
            "/System/Library/Fonts/AppleSDGothicNeo.ttc",
            "/System/Library/Fonts/Supplemental/AppleGothic.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ]
    } else if cfg!(target_os = "windows") {
        vec![
            "C:\\Windows\\Fonts\\malgun.ttf",
            "C:\\Windows\\Fonts\\malgunsl.ttf",
            "C:\\Windows\\Fonts\\arialuni.ttf",
        ]
    } else {
        vec![
            "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
    };

    for path in candidates {
        let path_ref = Path::new(path);
        if path_ref.exists() {
            if let Ok(bytes) = fs::read(path_ref) {
                return Some((
                    path_ref
                        .file_stem()
                        .and_then(|stem| stem.to_str())
                        .unwrap_or("yeonjang-ui-font")
                        .to_string(),
                    bytes,
                ));
            }
        }
    }

    None
}
