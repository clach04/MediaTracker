import _ from 'lodash';

import { repository } from 'src/repository/repository';
import { getItemsKnex, generateColumnNames } from 'src/knex/queries/items';
import { knex } from 'src/dbconfig';
import { getDetailsKnex } from 'src/knex/queries/details';
import { Seen } from 'src/entity/seen';
import { Watchlist } from 'src/entity/watchlist';
import { UserRating } from 'src/entity/userRating';
import { NotificationsHistory } from 'src/entity/notificationsHistory';
import { TvEpisode, tvEpisodeColumns } from 'src/entity/tvepisode';
import { tvSeasonRepository } from 'src/repository/season';
import { tvEpisodeRepository } from 'src/repository/episode';
import {
    ExternalIds,
    MediaItemBase,
    MediaItemBaseWithSeasons,
    mediaItemColumns,
    MediaItemDetailsResponse,
    MediaItemItemsResponse,
    MediaType,
} from 'src/entity/mediaItem';
import { imageRepository } from 'src/repository/image';

export type MediaItemOrderBy =
    | 'title'
    | 'lastSeen'
    | 'unseenEpisodes'
    | 'releaseDate'
    | 'nextAiring'
    | 'status'
    | 'mediaType';
export type SortOrder = 'asc' | 'desc';

export type LastSeenAt = 'now' | 'release_date' | 'unknown' | 'custom_date';

export type Pagination<T> = {
    data: T[];
    page: number;
    totalPages: number;
    from: number;
    to: number;
    total: number;
};

export type GetItemsArgs = {
    userId: number;
    mediaType?: MediaType;
    orderBy?: MediaItemOrderBy;
    sortOrder?: SortOrder;
    /**
     * @description Return only items with title including this phrase
     */
    filter?: string;
    /**
     * @description Return only items on watchlist
     */
    onlyOnWatchlist?: boolean;
    /**
     * @description Return only seen items
     */
    onlySeenItems?: boolean;
    /**
     * @description
     */
    onlyWithNextEpisodesToWatch?: boolean;
    /**
     * @description Return only items with upcoming episode with release date, or unreleased other media with release date
     */

    onlyWithNextAiring?: boolean;
    /**
     * @description Return only items with user rating
     */
    onlyWithUserRating?: boolean;
    /**
     * @description Return only items without user rating
     */
    onlyWithoutUserRating?: boolean;

    page?: number;
    mediaItemIds?: number[];
};

class MediaItemRepository extends repository<MediaItemBase>({
    tableName: 'mediaItem',
    columnNames: mediaItemColumns,
    primaryColumnName: 'id',
    booleanColumnNames: ['needsDetails'],
}) {
    public items(
        args: GetItemsArgs & { page: number }
    ): Promise<Pagination<MediaItemItemsResponse>>;
    public items(
        args: Omit<GetItemsArgs, 'page'>
    ): Promise<MediaItemItemsResponse[]>;
    public items(args: never): Promise<unknown> {
        return getItemsKnex(args);
    }

    public async details(params: { mediaItemId: number; userId: number }) {
        return getDetailsKnex(params);
    }

    public async update(mediaItem: MediaItemBaseWithSeasons) {
        super.update({
            ...mediaItem,
            genres: mediaItem.genres?.join(','),
            authors: mediaItem.authors?.join(','),
            narrators: mediaItem.narrators?.join(','),
        } as unknown);

        if (mediaItem.seasons) {
            for (const season of mediaItem.seasons) {
                if (season.id) {
                    await tvSeasonRepository.update(season);
                } else {
                    season.id = await tvSeasonRepository.create({
                        ...season,
                        tvShowId: mediaItem.id,
                    });
                    season.tvShowId = mediaItem.id;
                }

                if (season.episodes) {
                    for (const episode of season.episodes) {
                        if (episode.id) {
                            await tvEpisodeRepository.update(episode);
                        } else {
                            episode.id = await tvEpisodeRepository.create({
                                ...episode,
                                seasonId: season.id,
                                tvShowId: mediaItem.id,
                            });
                            episode.seasonId = season.id;
                            episode.tvShowId = mediaItem.id;
                        }
                    }
                }
            }
        }
    }

    public async create(mediaItem: Partial<MediaItemBaseWithSeasons>) {
        const mediaItemId = await super.create({
            ...mediaItem,
            lastTimeUpdated:
                'lastTimeUpdated' in mediaItem && mediaItem.lastTimeUpdated
                    ? mediaItem.lastTimeUpdated
                    : new Date().getTime(),
            genres: mediaItem.genres?.join(','),
            authors: mediaItem.authors?.join(','),
            narrators: mediaItem.narrators?.join(','),
        } as unknown);

        mediaItem.id = mediaItemId;

        if (mediaItem.seasons) {
            for (const season of mediaItem.seasons) {
                const seasonId = await tvSeasonRepository.create({
                    ...season,
                    id: season.id || undefined,
                    episodes: null,
                    tvShowId: mediaItem.id,
                });

                season.id = seasonId;
                season.tvShowId = mediaItem.id;

                if (season.episodes) {
                    for (const episode of season.episodes) {
                        const episodeId = await tvEpisodeRepository.create({
                            ...episode,
                            seasonId: season.id,
                            tvShowId: mediaItem.id,
                        });

                        episode.id = episodeId;
                        episode.seasonId = season.id;
                        episode.tvShowId = mediaItem.id;
                    }
                }
            }
        }

        return mediaItemId;
    }

    public async add(
        value: Omit<MediaItemBaseWithSeasons, 'lastTimeUpdated'> &
            Partial<Pick<MediaItemBaseWithSeasons, 'lastTimeUpdated'>>
    ): Promise<MediaItemDetailsResponse> {
        const lastTimeUpdated = value.lastTimeUpdated
            ? value.lastTimeUpdated
            : new Date().getTime();

        const id = await this.create({
            ...value,
            lastTimeUpdated: lastTimeUpdated,
        });

        const mediaItem: MediaItemDetailsResponse = {
            ...value,
            lastTimeUpdated: lastTimeUpdated,
            id: id,
        };

        if (mediaItem.poster) {
            const imageId = await imageRepository.create({
                mediaItemId: mediaItem.id,
                type: 'poster',
            });

            mediaItem.poster = `/img/${imageId}`;
            mediaItem.posterSmall = `/img/${imageId}?size=small`;
        }

        if (mediaItem.backdrop) {
            const imageId = await imageRepository.create({
                mediaItemId: mediaItem.id,
                type: 'backdrop',
            });

            mediaItem.backdrop = `/img/${imageId}`;
        }

        if (mediaItem.seasons) {
            for (const season of mediaItem.seasons) {
                if (season.poster) {
                    const imageId = await imageRepository.create({
                        mediaItemId: mediaItem.id,
                        seasonId: season.id,
                        type: 'poster',
                    });

                    season.poster = `/img/${imageId}`;
                    season.posterSmall = `/img/${imageId}?size=small`;
                }
            }
        }

        return mediaItem;
    }

    public async createMany(mediaItem: Partial<MediaItemBaseWithSeasons>[]) {
        return await Promise.all(
            mediaItem.map((mediaItem) => this.create(mediaItem))
        );
    }

    public async seasonsWithEpisodes(mediaItem: MediaItemBase) {
        const seasons = await tvSeasonRepository.find({
            tvShowId: Number(mediaItem.id),
        });

        const episodes = await tvEpisodeRepository.find({
            tvShowId: Number(mediaItem.id),
        });

        const groupedEpisodes = _.groupBy(
            episodes,
            (episode) => episode.seasonId
        );

        seasons.forEach(
            (season) => (season.episodes = groupedEpisodes[season.id])
        );

        return seasons;
    }

    public async findByExternalIds(params: {
        tmdbId?: number[];
        imdbId?: string[];
        tvmazeId?: number[];
        igdbId?: number[];
        openlibraryId?: number[];
        audibleId?: string[];
        mediaType: MediaType;
    }) {
        return (
            await knex<MediaItemBase>(this.tableName)
                .where({ mediaType: params.mediaType })
                .andWhere((qb) => {
                    if (params.tmdbId) {
                        qb.orWhereIn('tmdbId', params.tmdbId);
                    }
                    if (params.imdbId) {
                        qb.orWhereIn('imdbId', params.imdbId);
                    }
                    if (params.tvmazeId) {
                        qb.orWhereIn('tvmazeId', params.tvmazeId);
                    }
                    if (params.igdbId) {
                        qb.orWhereIn('igdbId', params.igdbId);
                    }
                    if (params.openlibraryId) {
                        qb.orWhereIn('openlibraryId', params.openlibraryId);
                    }
                    if (params.audibleId) {
                        qb.orWhereIn('audibleId', params.audibleId);
                    }
                })
        ).map((item) => this.deserialize(item));
    }

    public async findByExternalId(params: ExternalIds, mediaType: MediaType) {
        return this.deserialize(
            await knex<MediaItemBase>(this.tableName)
                .where({ mediaType: mediaType })
                .andWhere((qb) => {
                    if (params.tmdbId) {
                        qb.orWhere('tmdbId', params.tmdbId);
                    }
                    if (params.imdbId) {
                        qb.orWhere('imdbId', params.imdbId);
                    }
                    if (params.tvmazeId) {
                        qb.orWhere('tvmazeId', params.tvmazeId);
                    }
                    if (params.igdbId) {
                        qb.orWhere('igdbId', params.igdbId);
                    }
                    if (params.openlibraryId) {
                        qb.orWhere('openlibraryId', params.openlibraryId);
                    }
                    if (params.audibleId) {
                        qb.orWhere('audibleId', params.audibleId);
                    }
                })
                .first()
        );
    }

    public async findByTitle(params: {
        mediaType: MediaType;
        title: string;
        releaseYear?: number;
    }): Promise<MediaItemBase> {
        if (typeof params.title !== 'string') {
            return;
        }

        const qb = knex<MediaItemBase>(this.tableName)
            .select(
                '*',
                knex.raw(`LENGTH(title) - ${params.title.length} AS rank`)
            )
            .where('mediaType', params.mediaType)
            .where((qb) =>
                qb
                    .where('title', 'LIKE', `%${params.title}%`)
                    .orWhere('originalTitle', 'LIKE', `%${params.title}%`)
            )
            .orderBy('rank', 'asc');

        if (params.releaseYear) {
            qb.whereBetween('releaseDate', [
                new Date(params.releaseYear, 0, 1).toISOString(),
                new Date(params.releaseYear, 11, 31).toISOString(),
            ]);
        }

        return this.deserialize(await qb.first());
    }

    public async findByExactTitle(params: {
        mediaType: MediaType;
        title: string;
        releaseYear?: number;
    }): Promise<MediaItemBase> {
        if (typeof params.title !== 'string') {
            return;
        }

        const qb = knex<MediaItemBase>(this.tableName)
            .where('mediaType', params.mediaType)
            .where((qb) =>
                qb
                    .where('title', 'LIKE', params.title)
                    .orWhere('originalTitle', 'LIKE', params.title)
            );

        if (params.releaseYear) {
            qb.whereBetween('releaseDate', [
                new Date(params.releaseYear, 0, 1).toISOString(),
                new Date(params.releaseYear, 11, 31).toISOString(),
            ]);
        }

        return this.deserialize(await qb.first());
    }

    public async itemsToPossiblyUpdate(): Promise<MediaItemBase[]> {
        return await knex<MediaItemBase>('mediaItem')
            .select('mediaItem.*')
            .leftJoin<Seen>('seen', 'seen.mediaItemId', 'mediaItem.id')
            .leftJoin<Watchlist>(
                'watchlist',
                'watchlist.mediaItemId',
                'mediaItem.id'
            )
            .leftJoin<UserRating>(
                'userRating',
                'userRating.mediaItemId',
                'mediaItem.id'
            )
            .where((q) =>
                q
                    .whereNotNull('seen.id')
                    .orWhereNotNull('watchlist.id')
                    .orWhereNotNull('userRating.id')
            )
            .whereNot('source', 'user')
            .groupBy('mediaItem.id');
    }

    public async itemsToNotify(from: Date, to: Date): Promise<MediaItemBase[]> {
        return await knex<MediaItemBase>(this.tableName)
            .select('mediaItem.*')
            .select('notificationsHistory.mediaItemId')
            .select('notificationsHistory.id AS notificationsHistory.id')
            .leftJoin<NotificationsHistory>(
                'notificationsHistory',
                'notificationsHistory.mediaItemId',
                'mediaItem.id'
            )
            .whereBetween('mediaItem.releaseDate', [
                from.toISOString(),
                to.toISOString(),
            ])
            .whereNot('mediaType', 'tv')
            .whereNull('notificationsHistory.id');
    }

    public async episodesToNotify(from: Date, to: Date) {
        const res = await knex<TvEpisode>('episode')
            .select(generateColumnNames('episode', tvEpisodeColumns))
            .select(generateColumnNames('mediaItem', mediaItemColumns))
            .select('notificationsHistory.mediaItemId')
            .select('notificationsHistory.id AS notificationsHistory.id')
            .leftJoin<NotificationsHistory>(
                'notificationsHistory',
                'notificationsHistory.episodeId',
                'episode.id'
            )
            .leftJoin<MediaItemBase>(
                'mediaItem',
                'mediaItem.id',
                'episode.tvShowId'
            )
            .whereBetween('episode.releaseDate', [
                from.toISOString(),
                to.toISOString(),
            ])
            .where('episode.isSpecialEpisode', false)
            .whereNull('notificationsHistory.id');

        return res.map((row) =>
            _(row)
                .pickBy((value, column) => column.startsWith('episode.'))
                .mapKeys((value, key) => key.substring('episode.'.length))
                .set(
                    'tvShow',
                    _(row)
                        .pickBy((value, column) =>
                            column.startsWith('mediaItem.')
                        )
                        .mapKeys((value, key) =>
                            key.substring('mediaItem.'.length)
                        )
                        .value()
                )
                .value()
        ) as (TvEpisode & { tvShow: MediaItemBase })[];
    }

    public async lock(mediaItemId: number) {
        const res = await knex<MediaItemBase>(this.tableName)
            .update({ lockedAt: new Date().getTime() })
            .where('id', mediaItemId)
            .where('lockedAt', null);

        if (res === 0) {
            throw new Error(`MediaItem ${mediaItemId} is locked`);
        }
    }

    public async unlock(mediaItemId: number) {
        await knex<MediaItemBase>(this.tableName)
            .update({ lockedAt: null })
            .where('id', mediaItemId);
    }

    public async mediaItemsWithMissingPosters(
        mediaItemIdsWithPoster: number[]
    ) {
        return await knex<MediaItemBase>(this.tableName)
            .whereNotIn('id', mediaItemIdsWithPoster)
            .whereNotNull('poster')
            .whereNot('poster', '');
    }

    public async mediaItemsWithMissingBackdrop(
        mediaItemIdsWithBackdrop: number[]
    ) {
        return await knex<MediaItemBase>(this.tableName)
            .whereNotIn('id', mediaItemIdsWithBackdrop)
            .whereNotNull('backdrop')
            .whereNot('backdrop', '');
    }
}

export const mediaItemRepository = new MediaItemRepository();
