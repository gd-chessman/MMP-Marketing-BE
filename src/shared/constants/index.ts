export const DEFAULT_ROLES = [
    { name: 'ROLE_ADMIN', label: 'Quản trị viên', level: 1 },
    { name: 'ROLE_COLLABORATOR', label: 'Cộng tác viên', level: 2 },
    { name: 'ROLE_MEMBER', label: 'Thành viên', level: 3 },
];

export const DEFAULT_ADMIN_USER = {
    username: 'admin',
    name: 'Administrator',
    email: 'admin@example.com',
    password: '1234',
};

export const DEFAULT_SETTING = {
    appName: 'My App',
    logo: 'https://example.com/default-logo.png',
    emailNotification: 'support@example.com',
};  