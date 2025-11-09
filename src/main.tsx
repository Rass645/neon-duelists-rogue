// src/main.tsx
import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom/client';

// === Telegram SDK с fallback для локального режима ===
const initEnvironment = () => {
  try {
    const { init, retrieveLaunchParams, CloudStorage } = require('@tma.js/sdk');
    init();
    return {
      isTelegram: true,
      launchParams: retrieveLaunchParams(),
      CloudStorage
    };
  } catch (e) {
    return {
      isTelegram: false,
      launchParams: { initDataUnsafe: { user: { first_name: "Игрок", id: 123456789, username: "player" } } },
      CloudStorage: {
        get: async (key: string) => localStorage.getItem(key),
        set: async (key: string, value: string) => localStorage.setItem(key, value)
      }
    };
  }
};

const env = initEnvironment();
const { isTelegram, launchParams, CloudStorage } = env;

// === ТВОЙ TON-АДРЕС (ОБЯЗАТЕЛЬНО ЗАМЕНИ!) ===
const OWNER_ADDRESS = "EQC1234567890abcdef..."; // ← СЮДА ТВОЙ АДРЕС ИЗ @wallet

// === Данные игры ===
const ABILITIES = [
  { id: 'double_dmg', name: 'Удвоить урон', effect: 'atk', value: 2, color: '#ff2a6d' },
  { id: 'steal_energy', name: 'Кража энергии', effect: 'energy', value: 1, color: '#00f7ff' },
  { id: 'dodge', name: 'Шанс уворота', effect: 'dodge', value: 0.3, color: '#7b2cbf' },
  { id: 'heal', name: 'Мгновенное восстановление', effect: 'heal', value: 20, color: '#2ec4b6' },
  { id: 'crit', name: 'Критический удар', effect: 'crit', value: 0.5, color: '#f9c74f' },
  { id: 'freeze', name: 'Заморозка', effect: 'freeze', value: 2, color: '#5e60ce' }
];

const DUELISTS = [
  { id: 'rook', name: 'Rook', img: 'https://placehold.co/100/444444/FFFFFF?text=R' },
  { id: 'nyx', name: 'Nyx', img: 'https://placehold.co/100/000000/FFFFFF?text=N' },
  { id: 'kira', name: 'Kira', img: 'https://placehold.co/100/FF1493/FFFFFF?text=K' },
  { id: 'vex', name: 'Vex', img: 'https://placehold.co/100/00FFFF/000000?text=V', nft: true, price: 0.05 },
  { id: 'orac', name: 'Orac', img: 'https://placehold.co/100/0000FF/FFFFFF?text=O', nft: true, price: 0.05 },
  { id: 'drexx', name: 'Drexx', img: 'https://placehold.co/100/8A2BE2/FFFFFF?text=D', nft: true, price: 0.05 }
];

const DAILY_QUESTS = [
  { id: 'win_1', desc: 'Выиграть 1 дуэль', reward: 10 },
  { id: 'play_3', desc: 'Сыграть 3 боя', reward: 15 },
  { id: 'tournament', desc: 'Участвовать в турнире', reward: 25 }
];

// === Основной компонент ===
export default function App() {
  const [activeTab, setActiveTab] = useState('arena');
  const [player, setPlayer] = useState(() => ({
    id: launchParams.initDataUnsafe?.user?.id || 123456789,
    name: launchParams.initDataUnsafe?.user?.first_name || 'Игрок',
    username: launchParams.initDataUnsafe?.user?.username || 'player',
    level: 1,
    rep: 0,
    neo: 50,
    duelist: 'rook',
    unlocked: ['rook', 'nyx', 'kira'],
    energy: 5,
    lastReplenish: Date.now(),
    battles: 0,
    wins: 0,
    tournamentsWon: 0,
    dailyQuests: DAILY_QUESTS.map(q => ({ ...q, completed: false, progress: 0 })),
    lastDailyReset: new Date().toDateString(),
    clan: null as { id: string; name: string; members: number } | null,
    riskMode: false,
    riskAmount: 0
  }));

  const [battleState, setBattleState] = useState({
    active: false,
    phase: 'idle' as 'idle' | 'select' | 'fight' | 'result' | 'risk',
    log: '',
    selectedAbility: null as any,
    opponent: null as any,
    result: null as { win: boolean; reward: number } | null
  });

  const [showInvite, setShowInvite] = useState(false);

  // === Восстановление энергии ===
  useEffect(() => {
    const replenish = () => {
      const now = Date.now();
      const minutesPassed = (now - player.lastReplenish) / (1000 * 60);
      const newEnergy = Math.min(5, player.energy + Math.floor(minutesPassed / 3));
      if (newEnergy > player.energy) {
        setPlayer(p => ({ ...p, energy: newEnergy, lastReplenish: now }));
      }
    };
    const timer = setInterval(replenish, 60000);
    return () => clearInterval(timer);
  }, [player.energy, player.lastReplenish]);

  // === Ежедневный сброс заданий ===
  useEffect(() => {
    const today = new Date().toDateString();
    if (player.lastDailyReset !== today) {
      setPlayer(p => ({
        ...p,
        dailyQuests: DAILY_QUESTS.map(q => ({ ...q, completed: false, progress: 0 })),
        lastDailyReset: today
      }));
    }
  }, [player.lastDailyReset]);

  // === Загрузка данных ===
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await CloudStorage.get('neon_rogue_v1');
        if (saved) {
          const p = JSON.parse(saved);
          // Обновление энергии
          const now = Date.now();
          const minutesPassed = (now - p.lastReplenish) / (1000 * 60);
          const newEnergy = Math.min(5, p.energy + Math.floor(minutesPassed / 3));
          setPlayer({ ...p, energy: newEnergy, lastReplenish: now });
        }
      } catch (e) {
        console.log('Новый игрок');
      }
    };
    load();
  }, []);

  const savePlayer = async (p: any) => {
    setPlayer(p);
    try {
      await CloudStorage.set('neon_rogue_v1', JSON.stringify(p));
    } catch (e) {
      console.error('Сохранение', e);
    }
  };

  // === Начало боя ===
  const startBattle = () => {
    if (player.energy <= 0 || battleState.active) return;

    const randomAbilities = [...ABILITIES].sort(() => 0.5 - Math.random()).slice(0, 3);
    const opponent = {
      name: ['Phantom', 'Viper', 'Raven'][Math.floor(Math.random() * 3)],
      atk: 10 + Math.floor(player.level / 2),
      hp: 100 + player.level * 5
    };

    setBattleState({
      active: true,
      phase: 'select',
      log: 'Выбери способность для боя!',
      selectedAbility: null,
      opponent,
      result: null
    });
  };

  // === Выбор способности ===
  const selectAbility = (ability: any) => {
    if (battleState.phase !== 'select') return;

    setBattleState(s => ({ ...s, selectedAbility: ability, phase: 'fight', log: 'Бой начинается...' }));

    setTimeout(() => {
      // Симуляция боя
      const baseDmg = 10 + player.level * 2;
      let myDmg = baseDmg;
      let enemyDmg = opponent.atk || 12;

      // Применение способности
      if (ability.effect === 'atk') myDmg *= ability.value;
      if (ability.effect === 'crit' && Math.random() < ability.value) myDmg *= 2;

      const win = myDmg > enemyDmg;
      const reward = win ? 8 + player.level : 3;

      // Обновление заданий
      const updatedQuests = player.dailyQuests.map(q => {
        if (q.id === 'win_1' && win) return { ...q, progress: q.progress + 1 };
        if (q.id === 'play_3') return { ...q, progress: q.progress + 1 };
        return q;
      }).map(q => ({ ...q, completed: q.progress >= 1 }));

      const newPlayer = {
        ...player,
        neo: player.neo + reward,
        energy: player.energy - 1,
        battles: player.battles + 1,
        wins: win ? player.wins + 1 : player.wins,
        rep: player.rep + (win ? 15 : 5),
        level: Math.floor((player.rep + (win ? 15 : 5)) / 100) + 1,
        dailyQuests: updatedQuests,
        lastReplenish: Date.now()
      };

      savePlayer(newPlayer);

      setBattleState(s => ({
        ...s,
        phase: 'result',
        log: `Твой урон: ${myDmg}\nУрон врага: ${enemyDmg}\n${win ? '✅ ПОБЕДА!' : '❌ ПОРАЖЕНИЕ'}`,
        result: { win, reward }
      }));
    }, 1500);
  };

  // === Механика 50/50 ===
  const enterRiskMode = () => {
    if (!battleState.result) return;
    setBattleState(s => ({
      ...s,
      phase: 'risk',
      log: `Рискнуть? 50% шанс удвоить ${battleState.result.reward} NEO!`,
      riskAmount: battleState.result.reward
    }));
  };

  const resolveRisk = (takeRisk: boolean) => {
    if (!takeRisk) {
      setBattleState({ active: false, phase: 'idle', log: '', selectedAbility: null, opponent: null, result: null, riskAmount: 0 });
      return;
    }

    const success = Math.random() > 0.5;
    const finalReward = success ? battleState.riskAmount * 2 : 0;

    if (success) {
      const newPlayer = { ...player, neo: player.neo + battleState.riskAmount }; // уже получено + удвоение
      savePlayer(newPlayer);
      setBattleState(s => ({ ...s, log: `УДАЧА! +${battleState.riskAmount} NEO`, riskAmount: 0 }));
    } else {
      const newPlayer = { ...player, neo: player.neo - battleState.riskAmount }; // возврат
      savePlayer(newPlayer);
      setBattleState(s => ({ ...s, log: 'НЕ ПОВЕЗЛО... Все NEO потеряны', riskAmount: 0 }));
    }

    setTimeout(() => {
      setBattleState({ active: false, phase: 'idle', log: '', selectedAbility: null, opponent: null, result: null, riskAmount: 0 });
    }, 2000);
  };

  // === Турнир ===
  const enterTournament = async () => {
    if (!isTelegram) return alert('Только в Telegram!');
    // Здесь будет TON-транзакция
    alert('Турнир запущен! (в демо)');
    // Обновить статистику
    const newPlayer = { ...player, tournamentsWon: player.tournamentsWon + 1, rep: player.rep + 50 };
    savePlayer(newPlayer);
  };

  // === Покупка NFT ===
  const buyDuelist = async (id: string) => {
    if (!isTelegram) return alert('Только в Telegram!');
    const duelist = DUELISTS.find(d => d.id === id);
    if (!duelist || !duelist.nft) return;

    try {
      const { TonConnectUI } = await import('@tonconnect/ui-react');
      const tonConnectUI = new TonConnectUI({ manifestUrl: 'https://ваш-домен.vercel.app/tonconnect-manifest.json' });
      const tx = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 300,
        messages: [{
          address: OWNER_ADDRESS,
          amount: (duelist.price * 1_000_000_000).toString(),
          payload: new TextEncoder().encode(`nft_duelist_${id}`).toString("hex")
        }]
      });
      if (tx) {
        const newPlayer = { ...player, unlocked: [...player.unlocked, id] };
        savePlayer(newPlayer);
        alert(`Куплен: ${duelist.name}!`);
      }
    } catch (e) {
      alert('Покупка отменена.');
    }
  };

  // === Визуальные компоненты ===
  const renderBattleScreen = () => {
    if (!battleState.active) return null;

    if (battleState.phase === 'select') {
      return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h3>Выбери способность</h3>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '20px' }}>
            {battleState.selectedAbility ? (
              <div style={{ background: battleState.selectedAbility.color, padding: '15px', borderRadius: '12px', color: 'white', width: '100%' }}>
                {battleState.selectedAbility.name}
              </div>
            ) : (
              ABILITIES.slice(0, 3).map(ability => (
                <div
                  key={ability.id}
                  onClick={() => selectAbility(ability)}
                  style={{
                    background: ability.color,
                    padding: '15px',
                    borderRadius: '12px',
                    color: 'white',
                    cursor: 'pointer',
                    width: '30%'
                  }}
                >
                  {ability.name}
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (battleState.phase === 'risk') {
      return (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <h3>Рискнёшь?</h3>
          <div style={{ fontSize: '18px', margin: '20px 0' }}>
            {battleState.log}
          </div>
          <div style={{ display: 'flex', gap: '15px', justifyContent: 'center' }}>
            <button
              onClick={() => resolveRisk(false)}
              style={{ padding: '12px 24px', background: '#444', color: 'white', border: 'none', borderRadius: '30px' }}
            >
              Забрать {battleState.riskAmount} NEO
            </button>
            <button
              onClick={() => resolveRisk(true)}
              style={{ padding: '12px 24px', background: '#ff2a6d', color: 'white', border: 'none', borderRadius: '30px' }}
            >
              Рискнуть!
            </button>
          </div>
        </div>
      );
    }

    return (
      <div style={{ textAlign: 'center', padding: '20px' }}>
        <div style={{
          background: '#1a1a2e',
          padding: '20px',
          borderRadius: '16px',
          whiteSpace: 'pre-line',
          minHeight: '100px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          {battleState.log}
        </div>
        {battleState.phase === 'result' && battleState.result && (
          <button
            onClick={enterRiskMode}
            style={{ marginTop: '20px', padding: '10px 20px', background: '#00f7ff', color: '#000', border: 'none', borderRadius: '30px' }}
          >
            💥 50/50: Удвоить награду?
          </button>
        )}
      </div>
    );
  };

  const userName = player.name;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #0f0c29 0%, #1a1a2e 100%)',
      color: '#e0e0ff',
      minHeight: '100vh',
      fontFamily: 'Segoe UI, system-ui, sans-serif'
    }}>
      {/* Хедер */}
      <div style={{
        padding: '16px',
        background: 'rgba(0, 0, 0, 0.4)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid #3a3a5a'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0, fontSize: '22px', color: '#00f7ff' }}>Neon Duelists</h1>
          <div>
            <div style={{ fontSize: '14px' }}>{userName}</div>
            <div style={{ fontSize: '12px', color: '#888' }}>LVL {player.level}</div>
          </div>
        </div>
      </div>

      {/* Статусная панель */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-around',
        padding: '12px',
        background: 'rgba(26, 26, 46, 0.6)',
        borderBottom: '1px solid #3a3a5a'
      }}>
        <div>REP: <strong>{player.rep}</strong></div>
        <div>NEO: <strong>{player.neo}</strong></div>
        <div>⚡: <strong>{player.energy}/5</strong></div>
      </div>

      {/* Основной контент */}
      <div style={{ padding: '16px', paddingBottom: '80px', position: 'relative' }}>
        {activeTab === 'arena' && !battleState.active && (
          <div>
            <div style={{ textAlign: 'center', margin: '20px 0' }}>
              <img
                src={DUELISTS.find(d => d.id === player.duelist)?.img}
                alt="Duelist"
                width="120"
                height="120"
                style={{ borderRadius: '16px', border: '2px solid #00f7ff' }}
              />
            </div>

            <button
              onClick={startBattle}
              disabled={player.energy <= 0}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                background: player.energy > 0 ? '#ff2a6d' : '#555',
                color: 'white',
                border: 'none',
                borderRadius: '16px',
                fontWeight: 'bold',
                marginBottom: '16px'
              }}
            >
              ⚔️ Быстрая дуэль (15 сек)
            </button>

            <button
              onClick={enterTournament}
              style={{
                width: '100%',
                padding: '16px',
                fontSize: '18px',
                background: '#00f7ff',
                color: '#000',
                border: 'none',
                borderRadius: '16px',
                fontWeight: 'bold'
              }}
            >
              🏆 Турнир (0.1 TON)
            </button>

            <div style={{ marginTop: '20px', fontSize: '12px', color: '#888', textAlign: 'center' }}>
              После боя — шанс удвоить награду! 50/50 риск.
            </div>
          </div>
        )}

        {renderBattleScreen()}

        {activeTab === 'quests' && (
          <div>
            <h2 style={{ color: '#ff2a6d' }}>Ежедневные задания</h2>
            {player.dailyQuests.map(quest => (
              <div
                key={quest.id}
                style={{
                  background: quest.completed ? 'rgba(38, 198, 245, 0.2)' : 'rgba(30, 25, 60, 0.6)',
                  padding: '16px',
                  borderRadius: '12px',
                  margin: '12px 0',
                  border: quest.completed ? '1px solid #26c6f5' : '1px solid #3a3a5a'
                }}
              >
                <div>{quest.desc}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
                  <div>{quest.progress}/1</div>
                  <div>+{quest.reward} NEO</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'shop' && (
          <div>
            <h2 style={{ color: '#00f7ff' }}>NFT-Персонажи</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginTop: '16px' }}>
              {DUELISTS.filter(d => d.nft).map(duelist => {
                const isUnlocked = player.unlocked.includes(duelist.id);
                return (
                  <div key={duelist.id} style={{ background: 'rgba(30, 25, 60, 0.6)', borderRadius: '12px', overflow: 'hidden' }}>
                    <img src={duelist.img} alt={duelist.name} width="100%" style={{ height: '100px', objectFit: 'cover' }} />
                    <div style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'bold' }}>{duelist.name}</div>
                      <div style={{ fontSize: '14px', color: '#888' }}>{duelist.price} TON</div>
                      {isUnlocked ? (
                        <div style={{ marginTop: '8px', fontSize: '14px', color: '#00f7ff' }}>Разблокирован</div>
                      ) : (
                        <button
                          onClick={() => buyDuelist(duelist.id)}
                          style={{
                            width: '100%',
                            padding: '8px',
                            background: '#ff2a6d',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            marginTop: '8px'
                          }}
                        >
                          Купить
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'clan' && (
          <div>
            <h2 style={{ color: '#7b2cbf' }}>Клан</h2>
            {player.clan ? (
              <div style={{ background: 'rgba(30, 25, 60, 0.6)', padding: '16px', borderRadius: '12px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', color: '#7b2cbf' }}>{player.clan.name}</div>
                <div>Участников: {player.clan.members}/5</div>
                <div style={{ marginTop: '12px' }}>
                  <button style={{ padding: '8px 16px', background: '#444', color: 'white', border: 'none', borderRadius: '20px' }}>
                    Пригласить
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <div>У тебя пока нет клана</div>
                <button
                  onClick={() => setShowInvite(true)}
                  style={{ marginTop: '20px', padding: '10px 20px', background: '#7b2cbf', color: 'white', border: 'none', borderRadius: '20px' }}
                >
                  Создать клан
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Навигация */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'space-around',
        background: 'rgba(10, 8, 25, 0.95)',
        borderTop: '1px solid #3a3a5a',
        padding: '14px 0'
      }}>
        {[
          { id: 'arena', label: 'Арена', icon: '⚔️' },
          { id: 'quests', label: 'Задания', icon: '📋' },
          { id: 'shop', label: 'NFT', icon: '💎' },
          { id: 'clan', label: 'Клан', icon: '👪' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              background: 'none',
              border: 'none',
              color: activeTab === tab.id ? '#00f7ff' : '#888',
              fontSize: '20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '4px 8px'
            }}
          >
            <span>{tab.icon}</span>
            <span style={{ fontSize: '11px' }}>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Модалка создания клана */}
      {showInvite && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{ background: '#1a1a2e', padding: '24px', borderRadius: '16px', textAlign: 'center', maxWidth: '300px' }}>
            <h3>Создать клан</h3>
            <div style={{ marginTop: '16px', fontSize: '14px', color: '#888' }}>
              Пригласи 4 друзей через ссылку
            </div>
            <div style={{
              background: '#2a2a4a',
              padding: '12px',
              borderRadius: '8px',
              margin: '16px 0',
              wordBreak: 'break-all'
            }}>
              t.me/yourbot?start=clan_{player.id}
            </div>
            <button
              onClick={() => {
                setShowInvite(false);
                const newPlayer = {
                  ...player,
                  clan: { id: `clan_${player.id}`, name: `${player.name}'s Crew`, members: 1 }
                };
                savePlayer(newPlayer);
              }}
              style={{ padding: '10px 20px', background: '#7b2cbf', color: 'white', border: 'none', borderRadius: '20px' }}
            >
              Создать
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Запуск
const rootEl = document.getElementById('root');
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(<App />);
}