import { mediaItemRepository } from 'src/repository/mediaItem';
import { MediaItemBase } from 'src/entity/mediaItem';
import { Watchlist } from 'src/entity/watchlist';
import { User } from 'src/entity/user';
import { userRepository } from 'src/repository/user';
import { watchlistRepository } from 'src/repository/watchlist';
import { clearDatabase, runMigrations } from '../../../__utils__/utils';

const mediaItem: MediaItemBase = {
    id: 1,
    lastTimeUpdated: new Date().getTime(),
    mediaType: 'tv',
    source: 'user',
    title: 'title',
};

const user: User = {
    id: 1,
    name: 'user',
    password: 'password',
};

const watchlist: Watchlist = {
    id: 1,
    mediaItemId: mediaItem.id,
    userId: user.id,
};

describe('getItems', () => {
    beforeAll(async () => {
        await runMigrations();
        await userRepository.create(user);
        await mediaItemRepository.create(mediaItem);
        await watchlistRepository.create(watchlist);
    });

    afterAll(clearDatabase);

    test('list', async () => {
        const items = await mediaItemRepository.items({
            userId: 1,
        });

        expect(Array.isArray(items)).toBeTruthy();
        expect(items.length).toStrictEqual(1);
    });

    test('pagination', async () => {
        const items = await mediaItemRepository.items({
            userId: 1,
            page: 1,
        });

        expect(typeof items).toStrictEqual('object');
        expect(Object.keys(items)).toStrictEqual([
            'from',
            'to',
            'data',
            'total',
            'page',
            'totalPages',
        ]);

        expect(typeof items.from).toStrictEqual('number');
        expect(typeof items.to).toStrictEqual('number');
        expect(typeof items.total).toStrictEqual('number');
        expect(typeof items.page).toStrictEqual('number');
        expect(typeof items.totalPages).toStrictEqual('number');
        expect(Array.isArray(items.data)).toBeTruthy();

        expect(items.from).toStrictEqual(0);
        expect(items.to).toStrictEqual(1);
        expect(items.total).toStrictEqual(1);
        expect(items.page).toStrictEqual(1);
        expect(items.totalPages).toStrictEqual(1);
        expect(items.data.length).toStrictEqual(1);
    });
});
