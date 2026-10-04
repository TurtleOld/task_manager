# Changelog

## [2.1.0](https://github.com/TurtleOld/task_manager/compare/v2.0.0...v2.1.0) (2026-10-04)


### Features

* группы агенды по следующей неделе и месяцам ([#162](https://github.com/TurtleOld/task_manager/issues/162)) ([672b4a3](https://github.com/TurtleOld/task_manager/commit/672b4a39361ab1ebe824140638cd546a09c6cb1c))
* новая карточка задачи — строка свойств, раскрывающиеся разделы, общая лента ([#161](https://github.com/TurtleOld/task_manager/issues/161)) ([82eed46](https://github.com/TurtleOld/task_manager/commit/82eed465bfb6d022f9ad379ec224569ec058f40e))
* новый дизайн настроек — разделы со строками и оглавление ([#163](https://github.com/TurtleOld/task_manager/issues/163)) ([dbaa6c1](https://github.com/TurtleOld/task_manager/commit/dbaa6c18003bef2503676c76ac45e6d17e3396f1))
* оформление с глубиной — слои поверхностей, шрифт Geologica, тихие строки задач ([#160](https://github.com/TurtleOld/task_manager/issues/160)) ([02fa48e](https://github.com/TurtleOld/task_manager/commit/02fa48e7d180e9db2e660c13c129b9b316db6320))

## [2.0.0](https://github.com/TurtleOld/task_manager/compare/v1.7.5...v2.0.0) (2026-10-04)


### ⚠ BREAKING CHANGES

* после выкатки все пользователи входят заново.

### Features

* архивация списка и удаление только из архива ([#141](https://github.com/TurtleOld/task_manager/issues/141)) ([27ed7f8](https://github.com/TurtleOld/task_manager/commit/27ed7f8c45354fa881a09497c9f1f2237d0bd40a))
* безвозвратное удаление задачи из архива ([#143](https://github.com/TurtleOld/task_manager/issues/143)) ([8f946ed](https://github.com/TurtleOld/task_manager/commit/8f946edd02d1f7e5419e8bbb33045ff929d7ad15))
* вход по HttpOnly-сессии вместо DRF Token ([#151](https://github.com/TurtleOld/task_manager/issues/151)) ([ec2ef32](https://github.com/TurtleOld/task_manager/commit/ec2ef32863490099803eff316a84c339ca40fe17))
* завершать сессии при смене пароля и закрывать их сокеты ([#153](https://github.com/TurtleOld/task_manager/issues/153)) ([d8711a5](https://github.com/TurtleOld/task_manager/commit/d8711a5f62820da42adaff2fbe093d6ece698104))
* отдельная архивация задачи и разархивация из архива ([#142](https://github.com/TurtleOld/task_manager/issues/142)) ([02c124c](https://github.com/TurtleOld/task_manager/commit/02c124c6c3ea6edb686512c5b125f2de2478f99c))
* свой session engine со скользящим сроком ([#147](https://github.com/TurtleOld/task_manager/issues/147)) ([214df7f](https://github.com/TurtleOld/task_manager/commit/214df7fdfa864677559c23192696d37d06be9b12))
* список сессий в настройках с завершением отдельных входов ([#154](https://github.com/TurtleOld/task_manager/issues/154)) ([836b854](https://github.com/TurtleOld/task_manager/commit/836b854d718db0b019198392a66e23266b9dcfb3))
* удалить неработающий реестр прав из API и интерфейса ([#144](https://github.com/TurtleOld/task_manager/issues/144)) ([fe4a377](https://github.com/TurtleOld/task_manager/commit/fe4a377f88e01ccf826b4bcd08b4feda664a8333))


### Bug Fixes

* overdue reminders bypass preferences and ignore delivery failures ([#118](https://github.com/TurtleOld/task_manager/issues/118)) ([258193d](https://github.com/TurtleOld/task_manager/commit/258193d419651dcbc13ee40bd8d0029881b1f888))
* безопасная раздача вложений ([#157](https://github.com/TurtleOld/task_manager/issues/157)) ([20afd42](https://github.com/TurtleOld/task_manager/commit/20afd42690657fe71fef9df6cbc8b55a40b86e15))
* выходить из приложения при отзыве токена и не переподключать WebSocket ([#136](https://github.com/TurtleOld/task_manager/issues/136)) ([dfb95a5](https://github.com/TurtleOld/task_manager/commit/dfb95a542111cd1d6a1cb23fd11f67e412de6ff5))
* загрузка вложений больше 1 МБ ([#155](https://github.com/TurtleOld/task_manager/issues/155)) ([591f11c](https://github.com/TurtleOld/task_manager/commit/591f11c532c02958bec09b40f32684b3275535cc))
* запретить менять список задачи и вкладывать задачу с подзадачами ([#131](https://github.com/TurtleOld/task_manager/issues/131)) ([a726c26](https://github.com/TurtleOld/task_manager/commit/a726c262789ad7944f49c94761fdfe7028004205))
* защита входа от перебора за прокси и политика паролей ([#116](https://github.com/TurtleOld/task_manager/issues/116)) ([2cabd14](https://github.com/TurtleOld/task_manager/commit/2cabd14f33532bbd506e6105e9d42b2b60694ce9))
* искать упомянутого пользователя без учёта регистра логина ([#123](https://github.com/TurtleOld/task_manager/issues/123)) ([974e6dc](https://github.com/TurtleOld/task_manager/commit/974e6dc3b48be8fa3440d953039cc0f34ca60e4b))
* логировать kanban и учитывать ошибки диспетчера в healthcheck ([#134](https://github.com/TurtleOld/task_manager/issues/134)) ([7e2a654](https://github.com/TurtleOld/task_manager/commit/7e2a654efb80d6e67f41776ae28a0a2a039f3d13))
* настроить прокси-заголовки и secure-cookie для работы за HTTPS ([#129](https://github.com/TurtleOld/task_manager/issues/129)) ([85d1dd9](https://github.com/TurtleOld/task_manager/commit/85d1dd9c9ad1e233dc32b2f280d84083f77272fe))
* не давать менять повтор на неактуальном экземпляре серии ([#159](https://github.com/TurtleOld/task_manager/issues/159)) ([24b2605](https://github.com/TurtleOld/task_manager/commit/24b26055ce171180baaebbf31eb80e8be7b0dcd1))
* не доставлять уведомления устройствам истёкших сессий ([#152](https://github.com/TurtleOld/task_manager/issues/152)) ([b8366cd](https://github.com/TurtleOld/task_manager/commit/b8366cdf0636a39b8a7b9dfb7048d18315f56e27))
* не отправлять уведомления и не пускать в WebSocket деактивированных пользователей ([#124](https://github.com/TurtleOld/task_manager/issues/124)) ([a4106b7](https://github.com/TurtleOld/task_manager/commit/a4106b708060b4b9f8b820fbc2c2de52d4558281))
* не раскрывать детали здоровья из публичной сети ([#128](https://github.com/TurtleOld/task_manager/issues/128)) ([258fdf5](https://github.com/TurtleOld/task_manager/commit/258fdf5ee8d86a8d9f3417b271db40764ac70080))
* не удалять файл вложения, общий с другими экземплярами повтора ([#158](https://github.com/TurtleOld/task_manager/issues/158)) ([dcc78ee](https://github.com/TurtleOld/task_manager/commit/dcc78eece2feac0cce7e1f141056d8d674c9bd7d))
* обернуть изменение и создание NotificationEvent в единую транзакцию ([#125](https://github.com/TurtleOld/task_manager/issues/125)) ([a3c8e3f](https://github.com/TurtleOld/task_manager/commit/a3c8e3fc9a8ee1c4c2da8ef9f00c86295795b8a1))
* обновлять агенду после переподключения и сверять версию задачи ([#137](https://github.com/TurtleOld/task_manager/issues/137)) ([8d54e1e](https://github.com/TurtleOld/task_manager/commit/8d54e1ee268303445cf15c8421ac43165c1c6ff9))
* ограничить endpoint push-подписки allowlist и не отражать ответ push-сервиса ([#127](https://github.com/TurtleOld/task_manager/issues/127)) ([4dce251](https://github.com/TurtleOld/task_manager/commit/4dce251a0c7157cd5b4b7aa26e2fe04d45ac6931))
* ограничить Origin WebSocket allowlist из FRONTEND_BASE_URL ([#145](https://github.com/TurtleOld/task_manager/issues/145)) ([4bbd8a1](https://github.com/TurtleOld/task_manager/commit/4bbd8a1bf6f97ca610e460e5be34bf1d88346432))
* отправлять напоминания о сроке вне транзакции с блокировкой ([#120](https://github.com/TurtleOld/task_manager/issues/120)) ([2d63666](https://github.com/TurtleOld/task_manager/commit/2d63666202ede7c64c5c0198bdd52fd1d4b12f22))
* перепланировать напоминания при появлении канала push ([#121](https://github.com/TurtleOld/task_manager/issues/121)) ([67fbdcf](https://github.com/TurtleOld/task_manager/commit/67fbdcf22bb2987e3c7a0eb1becb83a7afbd3acd))
* полная локальная очистка при выходе и 401, общий helper WebSocket ([#146](https://github.com/TurtleOld/task_manager/issues/146)) ([3660912](https://github.com/TurtleOld/task_manager/commit/36609124ddc1c8a8e53729ae6918332a1d2ad4bb))
* проверять TLS при сборке Docker-образов ([#130](https://github.com/TurtleOld/task_manager/issues/130)) ([8a3ef24](https://github.com/TurtleOld/task_manager/commit/8a3ef247fbe1f16f4e7045ffd18053e9e3df1ddf))
* пропускать напоминание о сроке для уже выполненной задачи ([#119](https://github.com/TurtleOld/task_manager/issues/119)) ([06d42df](https://github.com/TurtleOld/task_manager/commit/06d42df86f49e78454cb3a14cfb880c7d5c10fcf))
* регистрировать service worker при запуске и открывать офлайн-навигацию ([#138](https://github.com/TurtleOld/task_manager/issues/138)) ([b32f695](https://github.com/TurtleOld/task_manager/commit/b32f69582295f543e88b0c1a15f4730fe970d1a8))
* сделать отметку задачи выполненной идемпотентной ([#122](https://github.com/TurtleOld/task_manager/issues/122)) ([219bb7f](https://github.com/TurtleOld/task_manager/commit/219bb7f01ad11d4b16a6f2cc8f876ff2ba18bf26))
* скрывать задачи архивированного списка из активных экранов ([#140](https://github.com/TurtleOld/task_manager/issues/140)) ([d649f5c](https://github.com/TurtleOld/task_manager/commit/d649f5ce4ec2293facb610bff8c7c5616832ba16))
* собирать образ backend из uv.lock и объявить djangorestframework ([#133](https://github.com/TurtleOld/task_manager/issues/133)) ([67a6909](https://github.com/TurtleOld/task_manager/commit/67a69098dd69020f4f5a69d85fd5e2e81a3f4c44))
* события об изменении и архивации задачи создаёт сервер, а не клиент ([#126](https://github.com/TurtleOld/task_manager/issues/126)) ([3db42b0](https://github.com/TurtleOld/task_manager/commit/3db42b0353892d7619c5b708bf73877be4001308))
* требовать текущий пароль при смене своего пароля ([#156](https://github.com/TurtleOld/task_manager/issues/156)) ([0007fb9](https://github.com/TurtleOld/task_manager/commit/0007fb9a1b7962468878f096b19b3ff896124270))
* уведомление о просрочке больше не доставляется дважды ([#115](https://github.com/TurtleOld/task_manager/issues/115)) ([1f74d20](https://github.com/TurtleOld/task_manager/commit/1f74d201754a153bcda1bd50e1dec64766413ee4))

## [1.7.5](https://github.com/TurtleOld/task_manager/compare/v1.7.4...v1.7.5) (2026-09-23)


### Bug Fixes

* боевой фронтенд работает на vite preview вместо прод-сервера ([#114](https://github.com/TurtleOld/task_manager/issues/114)) ([1a93620](https://github.com/TurtleOld/task_manager/commit/1a936207421989f2bf06b3b7f6fcba59a4cead62))
* боевой фронтенд работал на vite preview вместо прод-сервера ([1a93620](https://github.com/TurtleOld/task_manager/commit/1a936207421989f2bf06b3b7f6fcba59a4cead62))
* генерация повторов падала на FOR UPDATE с outer join ([#108](https://github.com/TurtleOld/task_manager/issues/108)) ([8a3a488](https://github.com/TurtleOld/task_manager/commit/8a3a48875afafc56b468bde53f09ad853edcb69f))
* доставка события дублировала push при повторной обработке ([#112](https://github.com/TurtleOld/task_manager/issues/112)) ([e3a9e58](https://github.com/TurtleOld/task_manager/commit/e3a9e582509232240dd7cbe8dcb7673beda03a80))
* остановка фоновых джоб диспетчера не попадала в healthcheck ([#111](https://github.com/TurtleOld/task_manager/issues/111)) ([379d54a](https://github.com/TurtleOld/task_manager/commit/379d54a9045bde9969ee7f2c7d712ce839da6b52))
* раздача /media в проде не работала вне DEBUG ([#113](https://github.com/TurtleOld/task_manager/issues/113)) ([da129dd](https://github.com/TurtleOld/task_manager/commit/da129dd73e99f0a1f7fa73eaeaefb6cf3c618e74))

## [1.7.4](https://github.com/TurtleOld/task_manager/compare/v1.7.3...v1.7.4) (2026-08-22)


### Bug Fixes

* добавить ручное обновление протухшей push-подписки на Android ([#100](https://github.com/TurtleOld/task_manager/issues/100)) ([03c2da0](https://github.com/TurtleOld/task_manager/commit/03c2da0360dbce79acf78b54c18fd3bb8c6c8772))

## [1.7.3](https://github.com/TurtleOld/task_manager/compare/v1.7.2...v1.7.3) (2026-08-22)


### Bug Fixes

* доставка Web Push не будила спящий Android и терялась в диспетчере ([#98](https://github.com/TurtleOld/task_manager/issues/98)) ([b42e5e3](https://github.com/TurtleOld/task_manager/commit/b42e5e31621fd0be0e2eb50a6319da2292235c31))

## [1.7.2](https://github.com/TurtleOld/task_manager/compare/v1.7.1...v1.7.2) (2026-08-20)


### Bug Fixes

* диспетчер уведомлений падал на каждом тике из-за FOR UPDATE на outer join ([#96](https://github.com/TurtleOld/task_manager/issues/96)) ([79c796f](https://github.com/TurtleOld/task_manager/commit/79c796f5e4b9d8d1c1ae05e8a0be83ccca3c7a0d))

## [1.7.1](https://github.com/TurtleOld/task_manager/compare/v1.7.0...v1.7.1) (2026-08-20)


### Bug Fixes

* исправить перекрытие элементов в мобильной версии ([f6b14dc](https://github.com/TurtleOld/task_manager/commit/f6b14dc4ba912029ba3ebce93cf993c7b4fd4122))
* перекрытие элементов в мобильной версии ([#94](https://github.com/TurtleOld/task_manager/issues/94)) ([f6b14dc](https://github.com/TurtleOld/task_manager/commit/f6b14dc4ba912029ba3ebce93cf993c7b4fd4122))

## [1.7.0](https://github.com/TurtleOld/task_manager/compare/v1.6.1...v1.7.0) (2026-08-20)


### Features

* агенда «Мой день» — корневой раздел, быстрое добавление и вкладка «Выполнено» ([#92](https://github.com/TurtleOld/task_manager/issues/92)) ([69232d9](https://github.com/TurtleOld/task_manager/commit/69232d9087899d7d78d7925c02698e64ad303d4f))

## [1.6.1](https://github.com/TurtleOld/task_manager/compare/v1.6.0...v1.6.1) (2026-08-19)


### Bug Fixes

* закрыть открытый API и починить пуш-уведомления о действиях с задачами ([#90](https://github.com/TurtleOld/task_manager/issues/90)) ([aae8752](https://github.com/TurtleOld/task_manager/commit/aae87522bdca2818e3f017844314ebd30863a7f3))

## [1.6.0](https://github.com/TurtleOld/task_manager/compare/v1.5.0...v1.6.0) (2026-08-19)


### Features

* обновить дизайн агенды под референс «индиго-слива» и добавить точный прогресс чек-листа ([#88](https://github.com/TurtleOld/task_manager/issues/88)) ([82e2380](https://github.com/TurtleOld/task_manager/commit/82e238000dd385b657f41c5b051779923e86b408))

## [1.5.0](https://github.com/TurtleOld/task_manager/compare/v1.4.0...v1.5.0) (2026-08-19)


### Features

* интерфейс повторяющихся задач и фикс доставки Web Push ([#87](https://github.com/TurtleOld/task_manager/issues/87)) ([f41a78b](https://github.com/TurtleOld/task_manager/commit/f41a78bc0a799ae0847a619a37c304839cb19175))


### Bug Fixes

* устранить гонку в generate_recurring_cards при двух dispatcher-инстансах ([#85](https://github.com/TurtleOld/task_manager/issues/85)) ([049e727](https://github.com/TurtleOld/task_manager/commit/049e727e3b62fe5769b8a129b975ecc54d5c4866))

## [1.4.0](https://github.com/TurtleOld/task_manager/compare/v1.3.1...v1.4.0) (2026-08-18)


### Features

* уведомления на телефон через Web Push ([#83](https://github.com/TurtleOld/task_manager/issues/83)) ([05a8fda](https://github.com/TurtleOld/task_manager/commit/05a8fda850c1f0413719ef0a8d25db07af588a3e))

## [1.3.1](https://github.com/TurtleOld/task_manager/compare/v1.3.0...v1.3.1) (2026-08-18)


### Bug Fixes

* выпустить застрявший релиз и не пускать пустые PR ([#81](https://github.com/TurtleOld/task_manager/issues/81)) ([f7441a7](https://github.com/TurtleOld/task_manager/commit/f7441a749d60377bceec32d6790086e224a53223))

## [1.3.0](https://github.com/TurtleOld/task_manager/compare/v1.2.13...v1.3.0) (2026-08-18)


### Features

* быстрое добавление задач в шапке агенды ([#09](https://github.com/TurtleOld/task_manager/issues/09)) ([#69](https://github.com/TurtleOld/task_manager/issues/69)) ([30d6c68](https://github.com/TurtleOld/task_manager/commit/30d6c68427335c40683c197777c954a74fbd013d))
* выполненность как свойство задачи ([#60](https://github.com/TurtleOld/task_manager/issues/60)) ([ca80b8e](https://github.com/TurtleOld/task_manager/commit/ca80b8e92e628f2e75561dfa3e31cf8b379913d7))
* данные агенды — эндпоинт GET /agenda/ ([#63](https://github.com/TurtleOld/task_manager/issues/63)) ([a2e1155](https://github.com/TurtleOld/task_manager/commit/a2e1155da44ca438fa4beb8362457cb1411c015b))
* маршруты списков и постоянные редиректы ([#65](https://github.com/TurtleOld/task_manager/issues/65)) ([b79eb3f](https://github.com/TurtleOld/task_manager/commit/b79eb3f0987c5fc4f62ee6807dd1214b2b320701))
* мобильная агенда ([#10](https://github.com/TurtleOld/task_manager/issues/10)) ([#70](https://github.com/TurtleOld/task_manager/issues/70)) ([e774cb4](https://github.com/TurtleOld/task_manager/commit/e774cb42a2d4180b01ce72876ab4c30e48895a18))
* отметить задачу выполненной и снять отметку ([#62](https://github.com/TurtleOld/task_manager/issues/62)) ([abd8c6c](https://github.com/TurtleOld/task_manager/commit/abd8c6c37ec18758e8695fbd7ed72366f74a11ed))
* панель «Сегодня у семьи» ([#08](https://github.com/TurtleOld/task_manager/issues/08)) ([#68](https://github.com/TurtleOld/task_manager/issues/68)) ([98e438e](https://github.com/TurtleOld/task_manager/commit/98e438eba0a304ff3e4a17ccbb20aa9243d77637))
* перекрасить приложение в палитру «Индиго-слива» ([#59](https://github.com/TurtleOld/task_manager/issues/59)) ([0b75384](https://github.com/TurtleOld/task_manager/commit/0b7538454124f9cdf46734ae9223afb02e0ba356))
* серверные потребители перестают судить о выполненности по колонке ([#11](https://github.com/TurtleOld/task_manager/issues/11)) ([#71](https://github.com/TurtleOld/task_manager/issues/71)) ([991492a](https://github.com/TurtleOld/task_manager/commit/991492ace5a3c49084250f2dae88d75338f1c410))
* экран агенды — группы задач по срокам ([#64](https://github.com/TurtleOld/task_manager/issues/64)) ([ab81543](https://github.com/TurtleOld/task_manager/commit/ab815438e80eca3ee204352ea56bf2577d5ea4c4))
* экран задачи ([#07](https://github.com/TurtleOld/task_manager/issues/07)) ([#66](https://github.com/TurtleOld/task_manager/issues/66)) ([6d75aec](https://github.com/TurtleOld/task_manager/commit/6d75aece8b8e3e45033e89ee14cf7617747ae11d))


### Bug Fixes

* валидировать путь редиректа после входа ([#58](https://github.com/TurtleOld/task_manager/issues/58)) ([53670be](https://github.com/TurtleOld/task_manager/commit/53670be03e2d66a23eff6c22ff312b81b3a0ddae))
* маршрутизировать доставку уведомлений в очередь notifications ([#55](https://github.com/TurtleOld/task_manager/issues/55)) ([8e3d6d9](https://github.com/TurtleOld/task_manager/commit/8e3d6d973a5ac6d9fec5c58ded28a6c6b5183ed2))
* убрать наложение строки быстрого добавления и дублирующие чипы списков ([#75](https://github.com/TurtleOld/task_manager/issues/75)) ([316490c](https://github.com/TurtleOld/task_manager/commit/316490c5b48ff07938840459f7dababac73c0692))

## [1.2.13](https://github.com/TurtleOld/task_manager/compare/v1.2.12...v1.2.13) (2026-08-09)


### Bug Fixes

* не терять напоминания о дедлайнах при перезапуске воркера ([#52](https://github.com/TurtleOld/task_manager/issues/52)) ([f27ee95](https://github.com/TurtleOld/task_manager/commit/f27ee95434dedfd10a390abba765fa5e6fe3570a))

## [1.2.12](https://github.com/TurtleOld/task_manager/compare/v1.2.11...v1.2.12) (2026-07-05)


### Bug Fixes

* show reminder interval form when no reminders exist yet ([2f80d8b](https://github.com/TurtleOld/task_manager/commit/2f80d8bae21389d134053bcdee1504a245e6a88f))

## [1.2.11](https://github.com/TurtleOld/task_manager/compare/v1.2.10...v1.2.11) (2026-07-02)


### Bug Fixes

* устранить рассинхрон component в конфиге release-please ([#43](https://github.com/TurtleOld/task_manager/issues/43)) ([fce1398](https://github.com/TurtleOld/task_manager/commit/fce1398647a4ad9ef356f1107bfccb88853fabe8))

## [1.2.10](https://github.com/TurtleOld/task_manager/compare/v1.2.9...v1.2.10) (2026-07-02)


### Bug Fixes

* пропадающий push при перемещении карточки из-за таймаутов redis ([#40](https://github.com/TurtleOld/task_manager/issues/40)) ([2abac69](https://github.com/TurtleOld/task_manager/commit/2abac692c7a37f2a950b026b1e8a40eca164fd23))

## [1.2.9](https://github.com/TurtleOld/task_manager/compare/v1.2.8...v1.2.9) (2026-06-26)


### Bug Fixes

* check rolldown native binary instead of rollup in frontend image ([#37](https://github.com/TurtleOld/task_manager/issues/37)) ([2d067a7](https://github.com/TurtleOld/task_manager/commit/2d067a73096317f368f6736777f46c91ddd54c7f))

## [1.2.8](https://github.com/TurtleOld/task_manager/compare/v1.2.7...v1.2.8) (2026-06-26)


### Bug Fixes

* keep redis connections alive to restore stale pub/sub ([#35](https://github.com/TurtleOld/task_manager/issues/35)) ([8e89252](https://github.com/TurtleOld/task_manager/commit/8e89252751a2ac5ab491bd8e4312ec970593aed3))

## [1.2.7](https://github.com/TurtleOld/task_manager/compare/v1.2.6...v1.2.7) (2026-06-10)


### Bug Fixes

* **android:** derive versionCode from versionName ([59285dc](https://github.com/TurtleOld/task_manager/commit/59285dce60ab9a58d667e7414caa326caf6be2b0))
* **notifications:** deduplicate notification preferences and enforce uniqueness ([095b361](https://github.com/TurtleOld/task_manager/commit/095b36130df61bbd3e3346c299ae4cbf855e426c))
